#!/usr/bin/env python3
"""
Guarded Google-Maps review miner for HAND-WASH evidence → review_snippets
(source='gmaps-detailing', is_detailing_evidence=true).

Clone of scripts/selfserve-harvest-reviews.py (same proven free flow: open the place by
place_id, click Reviews, type an OR keyword query into Google's own review search box with
TRUSTED keystrokes so Google pre-filters, scroll, parse real review cards; no SerpAPI /
Places API). Keeps the ★ _verify_place() contamination guard: every page is confirmed to
be THIS listing's place page before a single review is kept.

Hand-wash review vocabulary ("washed by hand", "hand dried", "detailed it", "wiped it
down") is MORE distinctive than self-serve's ("bay"/"vacuum" occur at every wash type), so
this is a strong CORROBORATION signal — it confirms the photo/vision classification and
supplies per-listing quality snippets. Still per the self-serve lesson: this only writes
review_snippets; it NEVER sets listings.is_hand_wash on keyword hits alone.

Modes:
  (default / --backlog)  every is_hand_wash=true listing not yet hand-wash-mined
  --discover             category-first hunt for NEW hand washes: is_hand_wash IS NULL rows
                         whose google_category/subtypes look like hand-wash / detailing
                         (evidence only — a later classify step decides is_hand_wash)
Run:
  python3 scripts/handwash-harvest-reviews.py --limit 15 --dry     # try it
  python3 scripts/handwash-harvest-reviews.py --limit 500          # real, resumable
"""
import asyncio, json, re, ssl, sys, os, datetime, urllib.request
from playwright.async_api import async_playwright

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SVC') or ANON
SSL_CTX = ssl.create_default_context(); SSL_CTX.check_hostname = False; SSL_CTX.verify_mode = ssl.CERT_NONE
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(SCRIPT_DIR, 'detailing-harvest-reviews.log')
SOURCE = 'gmaps-detailing'

# Google pre-filters reviews to these; keep it to terms customers actually type.
SEARCH_QUERY = 'detailing OR "ceramic coating" OR "paint correction" OR "clay bar" OR "interior detail" OR "paint protection" OR "full detail"'

# ── What we KEEP ─────────────────────────────────────────────────────────────────────
# STRONG: language describing DETAILING work. "detail" is only matched in its suffixed
# service forms (detailing/detailed/detailer) so the idiom "attention to detail" (bare
# "detail") never triggers — same guard the hand-wash miner uses.
STRONG_RE = re.compile(
    r'\bdetail(?:ing|ed|er|ers)\b|'                           # detailing / detailed / detailer
    r'\bceramic\s+coat\w*|'                                   # ceramic coating
    r'\bpaint\s+correction\b|'
    r'\bclay\s+bar\b|'
    r'\bpaint\s+protection\s+film\b|\bppf\b|'
    r'\b(?:buff|polish)(?:ing|ed)?\b|'                        # buffed / polishing
    r'\bswirl\w*\s+(?:remov\w*|free|gone|out)\b|remov\w*[^.!?]{0,10}?\bswirl\w*|'
    r'\b(?:full|interior|exterior|complete|paint)\s+detail\w*|'
    r'\bwet[\s-]?sand\w*|'
    r'\bheadlight\s+restor\w*|'
    r'\bengine\s+(?:bay\s+)?(?:detail\w*|clean\w*|degreas\w*)|'
    r'\bhand[\s-]?wax\w*|\bcarnauba\b|'
    r'(?:they|guys|men|crew|staff|workers?|employees?|team|shop|guy)\b'
    r'[^.!?]{0,35}?\b(?:detailed|buffed|polished|ceramic|corrected|waxed|shampoo\w*)',  # a person doing detailing
    re.I)
# WEAK: corroborating only (a wash may also wax); the Haiku evidence pass drops any that
# are really just a basic wash and not a detailing service.
WEAK_RE = re.compile(
    r'\bwax(?:ing|ed)?\b|'
    r'\bshampoo\w*|'
    r'\bpaint\s+seal\w*|'
    r'\b(?:full[\s-]?serv\w*|top[\s-]?to[\s-]?bottom)\b|'
    r'\binside\s+and\s+out\b|interior\s+and\s+exterior',
    re.I)
# NEGATIVE — reject the whole review: it describes a DIY / self-serve / coin-op wash, which
# contradicts a professional DETAILING service. (Not rejecting on "automatic" — a detailer is
# often praised in contrast to an automatic wash.)
NEG_RE = re.compile(
    r'\bself[\s-]?serv\w*|'
    r'\bwash(?:ed)?\s+(?:it\s+|my\s+(?:own\s+)?car\s+|your\s+car\s+)?(?:my|your|him|our)?self\b|'
    r'\bdid\s+it\s+myself\b|'
    r'\bwand\b|coin[\s-]?op\w*|'
    r'\bwash\s+(?:it\s+)?yourself\b|you\s+wash\s+(?:it|your\s+car)\b',
    re.I)

HAS_TAB_JS = r"""() => { const b=[...document.querySelectorAll('button[role=tab],div[role=tab],button')].find(x=>/^Reviews/.test((x.innerText||'').trim())||/^Reviews for/.test(x.getAttribute('aria-label')||'')); return !!b; }"""
CLICK_TAB_JS = r"""() => { const b=[...document.querySelectorAll('button[role=tab],div[role=tab],button')].find(x=>/^Reviews/.test((x.innerText||'').trim())||/^Reviews for/.test(x.getAttribute('aria-label')||'')); if(b){b.click(); return true;} return false; }"""
FOCUS_SEARCH_JS = r"""() => { const i=[...document.querySelectorAll('input.LCTIRd,input[class*=LCTIRd]')].find(x=>x.offsetParent!==null); if(!i)return false; i.focus(); i.value=''; return true; }"""
SCROLL_JS = r"""() => { const sels=['div[role=feed]','div.m6QErb[aria-label]','div[role=main] div[tabindex="-1"]']; let p=null; for(const s of sels){for(const el of document.querySelectorAll(s)){if(el.scrollHeight>el.clientHeight+100){p=el;break;}}if(p)break;} if(!p){let best=null,bd=0; for(const d of document.querySelectorAll('div')){const df=d.scrollHeight-d.clientHeight; if(df>bd&&d.clientHeight>200){bd=df;best=d;}} p=best;} if(p)p.scrollTop=p.scrollHeight; }"""
EXTRACT_JS = r"""() => {
  for (const b of document.querySelectorAll('button.w8nwRe, button[aria-label="See more"], button[jsaction*="expandReview"]')) { try{b.click()}catch(e){} }
  const out=[];
  for (const c of document.querySelectorAll('div[data-review-id]')) {
    const id = c.getAttribute('data-review-id'); if(!id) continue;
    const txtEl = c.querySelector('span.wiI7pd, div.MyEned span, span[class*="wiI7pd"]');
    const text = (txtEl?.innerText || '').trim(); if(!text) continue;
    const name = (c.querySelector('div.d4r55, div[class*="d4r55"]')?.innerText || '').trim();
    const info = (c.querySelector('div.RfnDt, div[class*="RfnDt"]')?.innerText || '').trim();
    const date = (c.querySelector('span.rsqaWe, span[class*="rsqaWe"]')?.innerText || '').trim();
    const al = c.querySelector('span[role=img][aria-label*="star"]')?.getAttribute('aria-label') || '';
    const m = al.match(/([\d.]+)\s*star/); const rating = m ? Math.round(parseFloat(m[1])) : null;
    out.push({review_id:id, text, name, info, date, rating});
  }
  return out;
}"""

STOP = {'car','cars','wash','washes','carwash','the','a','an','and','of','llc','inc','co','company','center','centre','hand'}
def _distinctive(s):
    return {w for w in re.findall(r'[a-z0-9]+', (s or '').lower()) if w not in STOP and len(w) > 2}

async def _verify_place(page, name):
    """True ONLY if this is a single place page for THIS listing (contamination guard)."""
    url = page.url or ''
    if '/maps/search/' in url:
        return False, 'search results page, not a place'
    if 'consent.google' in url:
        return False, 'consent wall'
    try:
        h1 = (await page.locator('h1').first.inner_text(timeout=4000)).strip()
    except Exception:
        return False, 'no place header'
    if not h1 or 'result' in h1.lower():
        return False, f'header looks like a list ({h1[:30]!r})'
    want, got = _distinctive(name), _distinctive(h1)
    if want and got and not (want & got):
        return False, f'name mismatch: page says {h1[:40]!r}'
    return True, h1

def log(m):
    print(m, flush=True)
    with open(LOG, 'a') as f: f.write(m + '\n')

def sb(method, path, body=None):
    req = urllib.request.Request(SUPABASE_URL + path, method=method,
        headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json',
                 'Prefer': 'resolution=merge-duplicates,return=minimal'},
        data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=60) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw.strip() else None

def stamp_mined(lid):
    """Mark the listing hand-wash-review-mined so the drain won't re-scrape it. Only on a
    COMPLETED attempt (reviews read, or confirmed none) — never a transient failure."""
    if DRY: return
    try:
        sb('PATCH', f'/rest/v1/listings?id=eq.{lid}',
           body={'detailing_reviews_mined_at': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    except Exception as e:
        log(f'  ⚠ stamp mined_at failed for {lid}: {str(e)[:60]}')

def parse_creds(info):
    is_lg = bool(info and re.search(r'local guide', info, re.I)); rc = pc = None
    if info:
        m = re.search(r'([\d,]+)\s+reviews?', info, re.I); rc = int(m.group(1).replace(',', '')) if m else None
        m = re.search(r'([\d,]+)\s+photos?', info, re.I); pc = int(m.group(1).replace(',', '')) if m else None
    return is_lg, rc, pc

async def harvest_one(page, listing, stats):
    lid = listing['id']; pid = listing['google_place_id']; nm = (listing.get('name') or '')[:34]
    url = f'https://www.google.com/maps/place/?q=place_id:{pid}'
    try:
        got = False
        for attempt in range(RELOADS):
            try:
                if attempt == 0: await page.goto(url, wait_until='domcontentloaded', timeout=45000)
                else: await page.reload(wait_until='domcontentloaded', timeout=45000)
            except Exception: pass
            await page.wait_for_timeout(2600)
            if 'consent.google' in page.url: stats['consent'] += 1; log(f'  ⚠ {nm}: CONSENT WALL'); return
            if await page.evaluate(HAS_TAB_JS): got = True; break
        if not got: stats['no_tab'] += 1; log(f'  · {nm}: no reviews tab'); stamp_mined(lid); return

        ok, why = await _verify_place(page, listing.get('name') or '')   # ★ verify BEFORE reading
        if not ok:
            stats['unverified'] += 1
            log(f'  🛑 {nm}: SKIPPED — {why}')
            return

        await page.evaluate(CLICK_TAB_JS)
        try: await page.wait_for_selector('div[data-review-id]', timeout=9000)
        except Exception: pass
        await page.wait_for_timeout(1200)
        try: await page.wait_for_selector('input.LCTIRd, input[class*="LCTIRd"]', state='attached', timeout=4000)
        except Exception: pass
        if await page.evaluate(FOCUS_SEARCH_JS):
            try:
                await page.keyboard.press('Control+A'); await page.keyboard.press('Delete')
                await page.keyboard.type(SEARCH_QUERY, delay=13)
                await page.keyboard.press('Enter')
                await page.wait_for_timeout(2800)
            except Exception: stats['no_search'] += 1
        else:
            stats['no_search'] += 1
        for _ in range(SCROLLS):
            await page.evaluate(SCROLL_JS); await page.wait_for_timeout(1000)
        reviews = await page.evaluate(EXTRACT_JS)
    except Exception as e:
        stats['fail'] += 1; log(f'  ❌ {nm}: {str(e)[:90]}'); return

    if not reviews: stats['zero'] += 1; log(f'  · {nm}: 0 cards'); stamp_mined(lid); return
    rows = []; hw_n = 0
    for r in reviews:
        text = r['text']
        if NEG_RE.search(text):            # "you wash it yourself with a wand" — contradicts attended hand wash
            continue
        hits = [m.group(0) for m in STRONG_RE.finditer(text)]
        if not hits:                       # weak terms only count in a wash context
            hits = [m.group(0) for m in WEAK_RE.finditer(text)]
        if not hits: continue
        hw_n += 1
        is_lg, rc, pc = parse_creds(r.get('info'))
        rt = r.get('rating')
        rows.append({
            'listing_id': lid, 'reviewer_name': r.get('name'), 'rating': int(rt) if rt is not None else None,
            'review_text': text[:1500], 'review_date': r.get('date'),
            'review_id': f"det-{lid}-{r['review_id']}", 'source': SOURCE,
            'is_detailing_evidence': True, 'detailing_keywords': hits,
            'reviewer_credentials': r.get('info'), 'reviewer_review_count': rc,
            'reviewer_photo_count': pc, 'reviewer_is_local_guide': is_lg,
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        })
    _seen = set(); rows = [r for r in rows if not (r['review_id'] in _seen or _seen.add(r['review_id']))]
    if rows and not DRY:
        try: sb('POST', '/rest/v1/review_snippets?on_conflict=review_id', body=rows)
        except Exception as e: log(f'  ⚠ {nm}: upsert {str(e)[:60]}')
    stamp_mined(lid)
    stats['ok'] += 1; stats['snip'] += len(rows); stats['hw_listings'] += (1 if hw_n >= 2 else 0)
    log(f"  ✓ {nm:<34} cards={len(reviews)} kept={len(rows)}{' ★' if hw_n >= 2 else ''}")

async def main():
    args = sys.argv[1:]
    def opt(flag, d=None):
        for i, a in enumerate(args):
            if a == flag and i+1 < len(args): return args[i+1]
            if a.startswith(flag + '='): return a.split('=', 1)[1]
        return d
    limit = int(opt('--limit', '0')); start = int(opt('--start', '0'))
    discover = '--discover' in args
    global DRY, SCROLLS, RELOADS
    DRY = '--dry' in args; SCROLLS = int(opt('--scrolls', '8')); RELOADS = int(opt('--reloads', '5'))
    headless = '--headless' in args   # Google serves headless clients a degraded page — default OFF

    targets = []
    if discover:
        # DISCOVERY (category-first): unclassified rows whose Google category/subtypes look
        # like a hand wash or detailer. Evidence only — a later classify step decides
        # is_hand_wash from these snippets + category + photos. Rows with NO category are
        # NOT swept here (that broad net is the self-serve miner's job); discovery stays
        # targeted to keep it cheap and precise.
        log('DISCOVER MODE — is_hand_wash IS NULL + google_category/subtypes ~ hand wash / detailing...')
        filt = ('&or=(google_category.ilike.*hand*wash*,google_subtypes.ilike.*hand*wash*,'
                'google_category.ilike.*detail*,google_subtypes.ilike.*detail*)')
        for off in range(0, 40000, 1000):
            rows = sb('GET', f'/rest/v1/listings?select=id,name,google_place_id&is_detailing=is.null'
                              f'&google_place_id=not.is.null{filt}&order=id&limit=1000&offset={off}')
            if not rows: break
            targets.extend([r for r in rows if (r.get('google_place_id') or '').startswith('ChIJ')])
            if len(rows) < 1000: break
        log(f'  discover: {len(targets)} candidate hand-wash / detail listings')
    else:
        # BACKLOG (default): every tagged hand-wash listing not yet mined, with reviews to
        # mine. is_hand_wash listings are pre-launch (not is_approved), so — unlike the
        # self-serve backlog — we do NOT require is_approved.
        log('BACKLOG MODE — is_hand_wash=true, place_id, not yet hand-wash-mined, has reviews...')
        off = 0
        while True:
            rows = sb('GET', f'/rest/v1/listings?select=id,name,google_place_id'
                              f'&is_detailing=eq.true'
                              f'&detailing_reviews_mined_at=is.null'
                              f'&google_place_id=not.is.null&review_count=gt.0'
                              f'&order=id&limit=1000&offset={off}')
            if not rows: break
            targets.extend([r for r in rows if (r.get('google_place_id') or '').startswith('ChIJ')])
            if len(rows) < 1000: break
            off += 1000
            if limit and len(targets) >= limit: break
        log(f'  backlog: {len(targets)} unmined hand-wash listings')

    # Resume: skip listings already harvested by THIS source.
    done = set()
    log(f'checking already-harvested ({SOURCE})...')
    all_ids = [t['id'] for t in targets]
    for i in range(0, len(all_ids), 100):
        rows = sb('GET', f"/rest/v1/review_snippets?select=listing_id&source=eq.{SOURCE}&listing_id=in.({','.join(all_ids[i:i+100])})")
        for r in (rows or []):
            if isinstance(r, dict): done.add(r['listing_id'])
    targets = [t for t in targets if t['id'] not in done][start:]
    if limit: targets = targets[:limit]
    log(f'targets: {len(targets)} (skipped {len(done)} already done) | headless={headless} dry={DRY}')

    stats = dict(ok=0, snip=0, zero=0, fail=0, consent=0, no_tab=0, no_search=0, unverified=0, hw_listings=0)
    UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    RESTART_EVERY = 120
    async with async_playwright() as p:
        browser = None; page = None
        for idx, t in enumerate(targets, 1):
            if browser is None or (idx - 1) % RESTART_EVERY == 0:
                if browser:
                    try: await browser.close()
                    except Exception: pass
                # Real Chrome (channel) resists Google's bot-detection best; headed by
                # default (Google degrades headless). Fall back to bundled Chromium.
                # Headed (Google degrades headless) but pushed OFF-SCREEN so a long run
                # doesn't pop up / steal focus on Michael's Mac. Playwright types via CDP,
                # so an off-screen window still receives the trusted keystrokes.
                launch_args = ['--lang=en-US', '--disable-blink-features=AutomationControlled',
                               '--window-position=-2400,-2400', '--window-size=1300,950']
                try:
                    browser = await p.chromium.launch(channel='chrome', headless=headless, args=launch_args)
                except Exception:
                    browser = await p.chromium.launch(headless=headless, args=launch_args)
                ctx = await browser.new_context(locale='en-US', viewport={'width': 1300, 'height': 950}, user_agent=UA)
                page = await ctx.new_page()
            try:
                await harvest_one(page, t, stats)
            except Exception as e:
                stats['fail'] += 1; log(f'  ❌ {(t.get("name") or "")[:30]}: outer {str(e)[:70]}')
            if idx % 20 == 0:
                log(f'  -- {idx}/{len(targets)} ok={stats["ok"]} snip={stats["snip"]} ★={stats["hw_listings"]} unverified={stats["unverified"]} consent={stats["consent"]} fail={stats["fail"]} --')
            await page.wait_for_timeout(600)
        if browser:
            try: await browser.close()
            except Exception: pass
    seen = stats['ok'] + stats['zero'] + stats['fail'] + stats['consent'] + stats['no_tab'] + stats['unverified']
    log(f'\nDONE ok={stats["ok"]} snippets={stats["snip"]} ★2+={stats["hw_listings"]} zero={stats["zero"]} '
        f'no_tab={stats["no_tab"]} unverified={stats["unverified"]} consent={stats["consent"]} fail={stats["fail"]}')
    if seen != len(targets):
        log(f'⚠ {len(targets) - seen} targets unaccounted for — silent path, investigate before scaling up.')

if __name__ == '__main__':
    asyncio.run(main())
