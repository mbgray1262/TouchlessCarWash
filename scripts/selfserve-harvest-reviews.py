#!/usr/bin/env python3
"""
Guarded Google-Maps review miner for SELF-SERVE evidence → review_snippets
(source='gmaps-selfserve', is_self_serve_evidence=true).

Same proven flow as the touchless miner (_tmp_harvest_snippets.py, which produced 84% of
our 42,720 snippets for $0): open the place by place_id, click the Reviews tab, type an OR
keyword query into Google's own review search box with TRUSTED keystrokes so Google
pre-filters, scroll, parse real review cards. Free — no SerpAPI, no Places API.

★ WHAT'S NEW HERE: _verify_place().
The touchless miner trusts whatever page it lands on. That is exactly how the photo scraper
contaminated MI/OH/AZ/NC — a dropped VPN served it a search/nearby page and it cached other
washes' content onto our listings. For photos that produced a wrong-looking hero; for
REVIEWS it would attach another business's words to a listing, i.e. publish a false claim
about a real company. So every page is verified as a single place page for THIS listing
before a single snippet is kept, and anything unverified is SKIPPED, never guessed.

⚠ Keyword hits are CORROBORATION, not a verdict. Self-serve vocabulary is not distinctive
the way touchless vocabulary is — "bay" and "vacuum" get written about every kind of wash.
Measured precision of these keywords alone is ~73% on a balanced set and worse in the wild.
This script therefore only ever writes review_snippets; it NEVER sets listings.is_self_service.
Classification combines this with Google's category + photo/vision evidence.

Run:
  python3 scripts/selfserve-harvest-reviews.py --limit 20 --dry     # try it
  python3 scripts/selfserve-harvest-reviews.py --limit 500          # real, resumable
"""
import asyncio, json, re, ssl, sys, os, datetime, urllib.request
from playwright.async_api import async_playwright

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
SSL_CTX = ssl.create_default_context(); SSL_CTX.check_hostname = False; SSL_CTX.verify_mode = ssl.CERT_NONE
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(SCRIPT_DIR, 'selfserve-harvest-reviews.log')
SOURCE = 'gmaps-selfserve'

# Google pre-filters reviews to these; keep it to terms customers actually type.
SEARCH_QUERY = 'self serve OR self-service OR wand OR coin OR quarters OR token OR "foam brush" OR bay'
# ── What we KEEP ─────────────────────────────────────────────────────────────────────
# Tiered, because a bare keyword is not evidence. Every rule below was written against
# real false positives from the first run — see the comments.
#
# STRONG: equipment you can only be describing if you're standing in a wand bay.
STRONG_RE = re.compile(
    r'\bwands?\b|foam(?:ing)?\s+brush|'
    r'self[\s-]?serv\w*\s+(?:bay|stall|area|side)|(?:manual|self)\s+wash\s+bay|'
    r'\bwash\s+bays?\b|hand\s+wash\s+station|do[\s-]?it[\s-]?yourself|'
    r'\bspray\s+(?:it|your\s+car)\s+yourself\b|wash\s+it\s+yourself|self\s+wash\b',
    re.I)
# WEAK: coins/quarters/tokens. At a car wash these are usually for the AIR PUMP or the
# VACUUM, not a wash bay ("I had $1.50 in quarters... to put air in one of my tires").
# Only count them when a wash-bay word sits within ~40 chars.
WEAK_RE = re.compile(
    r'(?:\bcoins?\b|\bquarters?\b|\btokens?\b|coin[\s-]?op\w*)(?=.{0,40}?'
    r'(?:wash|bay|wand|brush|soap|timer|sprayer))|'
    r'(?:wash|bay|wand|brush|soap|timer|sprayer).{0,40}?(?:\bcoins?\b|\bquarters?\b|\btokens?\b)',
    re.I)
# NEGATIVE — reject outright. Each one burned us in the first run:
NEG_RE = re.compile(
    r'\b(?:no|not a|isn\'?t a|used to be a|no longer a)\s+(?:self[\s-]?serv\w*|wand)|'
    r'coin\s+purse|'                                    # a THEFT report, not a coin-op wash
    r'(?:quarters?|coins?).{0,30}(?:air|tire|vacuum)|'  # change for the air pump / vacuum
    r'(?:air|tire|vacuum)\s+machine|'
    r'self[\s-]?serv\w*\s+drive[\s-]?(?:thru|through)|' # that's an AUTOMATIC, not a wand bay
    r'(?:go|going|goes|drive|drove)\s+to\s+a\s+self[\s-]?serv|'   # comparing to ANOTHER business
    r'(?:than|like|versus|vs\.?)\s+a\s+self[\s-]?serv',
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

STOP = {'car','cars','wash','washes','carwash','the','a','an','and','of','llc','inc','co','company','center','centre'}
def _distinctive(s):
    """Content words of a business name — what must corroborate between our name and the page's."""
    return {w for w in re.findall(r'[a-z0-9]+', (s or '').lower()) if w not in STOP and len(w) > 2}

async def _verify_place(page, name):
    """
    True ONLY if this is a single place page for THIS listing.

    Guards the contamination class that hit the photo scraper: a dropped VPN / stale place_id
    lands us on a results list or a DIFFERENT nearby wash, and we'd attribute its reviews here.
    """
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
    # If our name has distinctive words, the page header must share at least one. If the name
    # is fully generic ("Self Serve Car Wash"), we cannot name-verify — accept the bare place
    # page, since we arrived via a place_id URL and it is not a results list.
    if want and got and not (want & got):
        return False, f'name mismatch: page says {h1[:40]!r}'
    return True, h1

def log(m):
    print(m, flush=True)
    with open(LOG, 'a') as f: f.write(m + '\n')

def sb(method, path, body=None):
    req = urllib.request.Request(SUPABASE_URL + path, method=method,
        headers={'apikey': ANON, 'Authorization': f'Bearer {ANON}', 'Content-Type': 'application/json',
                 'Prefer': 'resolution=merge-duplicates,return=minimal'},
        data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=60) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw.strip() else None

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
        if not got: stats['no_tab'] += 1; log(f'  · {nm}: no reviews tab'); return

        # ★ THE GUARD — verify BEFORE reading a single review.
        ok, why = await _verify_place(page, listing.get('name') or '')
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

    if not reviews: stats['zero'] += 1; log(f'  · {nm}: 0 cards'); return
    rows = []; ss_n = 0
    for r in reviews:
        text = r['text']
        if NEG_RE.search(text):            # "no self serve here" — never store as evidence FOR
            continue
        hits = [m.group(0) for m in STRONG_RE.finditer(text)]
        if not hits:                       # weak terms only count in a wash-bay context
            hits = [m.group(0) for m in WEAK_RE.finditer(text)]
        if not hits: continue
        ss_n += 1
        is_lg, rc, pc = parse_creds(r.get('info'))
        rt = r.get('rating')
        rows.append({
            'listing_id': lid, 'reviewer_name': r.get('name'), 'rating': int(rt) if rt is not None else None,
            'review_text': text[:1500], 'review_date': r.get('date'),
            'review_id': f"ss-{lid}-{r['review_id']}", 'source': SOURCE,
            'is_self_serve_evidence': True, 'self_serve_keywords': hits,
            'reviewer_credentials': r.get('info'), 'reviewer_review_count': rc,
            'reviewer_photo_count': pc, 'reviewer_is_local_guide': is_lg,
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        })
    _seen = set(); rows = [r for r in rows if not (r['review_id'] in _seen or _seen.add(r['review_id']))]
    if rows and not DRY:
        try: sb('POST', '/rest/v1/review_snippets?on_conflict=review_id', body=rows)
        except Exception as e: log(f'  ⚠ {nm}: upsert {str(e)[:60]}')
    stats['ok'] += 1; stats['snip'] += len(rows); stats['ss_listings'] += (1 if ss_n >= 2 else 0)
    log(f"  ✓ {nm:<34} cards={len(reviews)} kept={len(rows)}{' ★' if ss_n >= 2 else ''}")

async def main():
    args = sys.argv[1:]
    def opt(flag, d=None):
        for i, a in enumerate(args):
            if a == flag and i+1 < len(args): return args[i+1]
            if a.startswith(flag + '='): return a.split('=', 1)[1]
        return d
    limit = int(opt('--limit', '0')); start = int(opt('--start', '0'))
    global DRY, SCROLLS, RELOADS
    DRY = '--dry' in args; SCROLLS = int(opt('--scrolls', '8')); RELOADS = int(opt('--reloads', '5'))
    headless = '--headless' in args   # Google serves headless clients a degraded page — default OFF

    # Targets: unclassified listings with a real place_id that are plausibly CAR WASHES.
    #
    # The naive "unclassified + place_id" filter is 30,626 rows and includes 3,996 gas
    # stations, 3,185 detailers, 504 dollar stores and a license plate agency. At ~33s each
    # that's ~5 wasted days of scraping. Google's category narrows it to the real pool;
    # rows with NO category are kept (unknown ≠ not a wash — that's the mistake that would
    # silently drop real washes).
    log('fetching targets (unclassified + place_id + plausibly a car wash)...')
    targets = []
    for filt in ('&or=(google_category.ilike.*car%20wash*,google_subtypes.ilike.*car%20wash*)',
                 '&google_category=is.null&google_subtypes=is.null'):
        for off in range(0, 40000, 1000):
            rows = sb('GET', f'/rest/v1/listings?select=id,name,google_place_id&is_self_service=is.null'
                              f'&google_place_id=not.is.null{filt}&order=id&limit=1000&offset={off}')
            if not rows: break
            targets.extend([r for r in rows if (r.get('google_place_id') or '').startswith('ChIJ')])
            if len(rows) < 1000: break
    # Don't spend 30s of scraping to confirm what the name already tells us: conveyor chains
    # and express/auto-spa brands are not self-serve (a name that says "self serv" outright wins).
    CHAIN = re.compile(r"\b(tidal wave|whistle express|mister car ?wash|quick quack|tommy'?s express|take 5|zips? car ?wash|club car ?wash|super ?star car ?wash|autobell|el car ?wash|splash ?in|go car ?wash|crew car ?wash|delta sonic|flagstop|rocket car ?wash|caliber car ?wash|jax kar ?wash|sparkling image)\b", re.I)
    EXCL = re.compile(r'\b(express|auto spa|tunnel)\b', re.I)
    SELF = re.compile(r'self[\s-]?serv', re.I)
    before = len(targets)
    targets = [t for t in targets
               if not CHAIN.search(t.get('name') or '')
               and not (EXCL.search(t.get('name') or '') and not SELF.search(t.get('name') or ''))]
    log(f'  {before} plausible car washes → {len(targets)} after dropping chains / express / auto spa')

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

    stats = dict(ok=0, snip=0, zero=0, fail=0, consent=0, no_tab=0, no_search=0, unverified=0, ss_listings=0)
    UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    RESTART_EVERY = 120
    async with async_playwright() as p:
        browser = None; page = None
        for idx, t in enumerate(targets, 1):
            if browser is None or (idx - 1) % RESTART_EVERY == 0:
                if browser:
                    try: await browser.close()
                    except Exception: pass
                browser = await p.chromium.launch(headless=headless, args=['--lang=en-US'])
                ctx = await browser.new_context(locale='en-US', viewport={'width': 1300, 'height': 950}, user_agent=UA)
                page = await ctx.new_page()
            try:
                await harvest_one(page, t, stats)
            except Exception as e:
                stats['fail'] += 1; log(f'  ❌ {(t.get("name") or "")[:30]}: outer {str(e)[:70]}')
            if idx % 20 == 0:
                log(f'  -- {idx}/{len(targets)} ok={stats["ok"]} snip={stats["snip"]} ★={stats["ss_listings"]} unverified={stats["unverified"]} consent={stats["consent"]} fail={stats["fail"]} --')
            await page.wait_for_timeout(600)
        if browser:
            try: await browser.close()
            except Exception: pass
    # Every target must land in exactly one bucket, or there's a silent path.
    seen = stats['ok'] + stats['zero'] + stats['fail'] + stats['consent'] + stats['no_tab'] + stats['unverified']
    log(f'\nDONE ok={stats["ok"]} snippets={stats["snip"]} ★2+={stats["ss_listings"]} zero={stats["zero"]} '
        f'no_tab={stats["no_tab"]} unverified={stats["unverified"]} consent={stats["consent"]} fail={stats["fail"]}')
    if seen != len(targets):
        log(f'⚠ {len(targets) - seen} targets unaccounted for — silent path, investigate before scaling up.')

if __name__ == '__main__':
    asyncio.run(main())
