#!/usr/bin/env python3
"""
Clean Google-Maps REVIEWS-TAB KEYWORD-SEARCH miner  →  review_snippets (source='gmaps-search-clean').

Reconstruction of the deleted _tmp_harvest_snippets.py — the canonical "Review-Mined
Score method" step 1. Per listing:
  1. open the place; RELOAD until the Reviews tab appears (Maps often loads degraded)
  2. click the Reviews tab
  3. focus the reviews Search box (input.LCTIRd) and type the OR keyword query with
     TRUSTED keystrokes (page.keyboard.type over CDP — Google's review filter ignores
     synthetic JS keystrokes), so Google itself pre-filters to matching reviews
  4. scroll the filtered list, expand ("More"), parse real review CARDS
  5. classify is_touchless_evidence (+ paint_relevant) and upsert clean snippets

Non-headless (Google serves headless clients a degraded page). Resumable/batched:
skips listings that already have a gmaps-search-clean snippet.

Run: python3 scripts/_tmp_harvest_snippets.py --csv scripts/tss-mining-targets.csv [--limit N] [--start K] [--headless] [--ids ...] [--scrolls 10]
"""
import asyncio, json, re, ssl, sys, os, csv, datetime, urllib.request
from playwright.async_api import async_playwright

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
SSL_CTX = ssl.create_default_context(); SSL_CTX.check_hostname = False; SSL_CTX.verify_mode = ssl.CERT_NONE
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(SCRIPT_DIR, '_tmp_harvest_snippets.log')

# ── canonical keyword lists (same as last time) ──────────────────────────
SEARCH_QUERY = 'touch OR touchless OR brushless OR laser OR touch-free OR scratch OR scratched OR swirl OR paint OR damage OR damaged OR chipped OR dent OR scuff'
TOUCHLESS_RE = re.compile(r'touch[- ]?(?:less|free)|brushless|laser\s*wash|no\s+touch|no\s+brush', re.I)
PAINT_RE = re.compile(r'\b(scratch\w*|swirl\w*|paint|chip\w*|scuff\w*|damage\w*|dent\w*|peel\w*)\b', re.I)

# Negators that, sitting IMMEDIATELY before a touchless keyword, FLIP its meaning
# ("not brushless", "isn't touch free", "certainly not touchless", "no longer touch-free").
# Anchored to end-of-string so only an adjacent negator (optionally + an article) counts —
# this deliberately does NOT match "never used a touchless wash THAT cleans this well", which
# is a positive comparison. Bare "no" is excluded because "no-touch"/"no brush" are positive.
NEG_BEFORE = re.compile(
    r"\b(not|isn'?t|aren'?t|wasn'?t|weren'?t|ain'?t|no longer|not really|not even|hardly|barely|far from|anything but)"
    r"\s+(a\s+|really\s+|truly\s+|very\s+|the\s+)?$", re.I)


def is_touchless_evidence(text):
    """True only if a touchless keyword appears that is NOT negated by an adjacent negator.
    Prevents 'Not brushless'/'not touch free' reviews from being flagged as positive
    touchless evidence (the negation false-positive class fixed 2026-06-17)."""
    matches = list(TOUCHLESS_RE.finditer(text))
    if not matches:
        return False
    for m in matches:
        pre = text[max(0, m.start() - 25):m.start()]
        if not NEG_BEFORE.search(pre):
            return True  # at least one un-negated touchless mention
    return False  # every touchless mention was negated

HAS_TAB_JS = r"""() => { const b=[...document.querySelectorAll('button[role=tab],div[role=tab],button')].find(x=>/^Reviews/.test((x.innerText||'').trim())||/^Reviews for/.test(x.getAttribute('aria-label')||'')); return !!b; }"""
CLICK_TAB_JS = r"""() => { const b=[...document.querySelectorAll('button[role=tab],div[role=tab],button')].find(x=>/^Reviews/.test((x.innerText||'').trim())||/^Reviews for/.test(x.getAttribute('aria-label')||'')); if(b){b.click(); return true;} return false; }"""
FOCUS_SEARCH_JS = r"""() => { const i=[...document.querySelectorAll('input.LCTIRd,input[class*=LCTIRd]')].find(x=>x.offsetParent!==null); if(!i)return false; i.focus(); i.value=''; return true; }"""
SCROLL_JS = r"""() => { const sels=['div[role=feed]','div.m6QErb[aria-label]','div[role=main] div[tabindex="-1"]']; let p=null; for(const s of sels){for(const el of document.querySelectorAll(s)){if(el.scrollHeight>el.clientHeight+100){p=el;break;}}if(p)break;} if(!p){let best=null,bd=0; for(const d of document.querySelectorAll('div')){const df=d.scrollHeight-d.clientHeight; if(df>bd&&d.clientHeight>200){bd=df;best=d;}} p=best;} if(p)p.scrollTop=p.scrollHeight; }"""
EXTRACT_JS = r"""() => {
  for (const b of document.querySelectorAll('button.w8nwRe, button[aria-label="See more"], button[jsaction*="expandReview"]')) { try{b.click()}catch(e){} }
  const out=[];
  for (const c of document.querySelectorAll('div[data-review-id]')) {
    const id=c.getAttribute('data-review-id'); if(!id) continue;
    const q=(sels)=>{for(const s of sels){const el=c.querySelector(s); if(el)return el;} return null;};
    const nameEl=q(['.d4r55','[class*="d4r55"]']), infoEl=q(['.RfnDt','[class*="RfnDt"]']);
    const dateEl=q(['.rsqaWe','[class*="rsqaWe"]']), textEl=q(['.wiI7pd','[class*="wiI7pd"]','.MyEned']);
    const ratingEl=q(['[role="img"][aria-label*="star"]','[aria-label*="stars"]','.kvMYJc']);
    let rating=null; if(ratingEl){const m=(ratingEl.getAttribute('aria-label')||'').match(/([0-9.]+)\s*star/i); if(m)rating=parseFloat(m[1]);}
    const text=textEl?(textEl.innerText||'').trim():''; if(!text) continue;
    out.push({review_id:id, name:nameEl?(nameEl.innerText||'').trim():null, info:infoEl?(infoEl.innerText||'').trim():null, date:dateEl?(dateEl.innerText||'').trim():null, rating, text});
  }
  return out;
}"""

def log(m):
    line = f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {m}'
    print(line, flush=True)
    with open(LOG, 'a') as f: f.write(line + '\n')

def sb(method, path, body=None):
    h = {'apikey': ANON, 'Authorization': 'Bearer ' + ANON, 'Content-Type': 'application/json'}
    if method in ('POST', 'PATCH'): h['Prefer'] = 'return=minimal,resolution=merge-duplicates'
    req = urllib.request.Request(SUPABASE_URL + path, data=json.dumps(body).encode() if body else None, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
            try: return json.loads(r.read() or b'null')
            except: return None
    except urllib.error.HTTPError as e:
        raise Exception(f'{e.code}: {e.read().decode()[:160]}')

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
        # Google Maps place pages serve a ROTATING set of UI variants — the reviews
        # tab is absent on some loads — so reload-retry until it appears. (The
        # keyword-search box ALSO rotates AND its obfuscated class rotates over time;
        # `input.LCTIRd` is currently stale, so we usually fall back to scroll-scrape,
        # which has adequate recall for our review-count range. See
        # reference_gmaps_reviews_rotation memory before re-enabling a search-box retry.)
        got = False
        for attempt in range(RELOADS):
            try:
                if attempt == 0: await page.goto(url, wait_until='domcontentloaded', timeout=45000)
                else: await page.reload(wait_until='domcontentloaded', timeout=45000)
            except Exception: pass
            await page.wait_for_timeout(2600)
            if 'consent.google' in page.url: stats['consent'] += 1; log(f'  ⚠ {nm}: CONSENT WALL'); return
            if await page.evaluate(HAS_TAB_JS): got = True; break
        if not got: stats['no_tab'] += 1; log(f'  · {nm}: no reviews tab after {RELOADS} reloads'); return
        await page.evaluate(CLICK_TAB_JS)
        try: await page.wait_for_selector('div[data-review-id]', timeout=9000)
        except Exception: pass
        await page.wait_for_timeout(1200)
        # focus reviews Search box + TRUSTED keystrokes (wait for it to render)
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
    rows = []; tl_n = 0; paint_n = 0
    for r in reviews:
        text = r['text']
        # kw = mentions a touchless keyword at all (store it either way); tl = un-negated
        # touchless evidence (negation-aware). A "not brushless" review still gets stored
        # as a snippet but with is_touchless_evidence=False.
        kw = bool(TOUCHLESS_RE.search(text)); tl = is_touchless_evidence(text); paint = bool(PAINT_RE.search(text))
        if not (kw or paint): continue
        if tl: tl_n += 1
        if paint: paint_n += 1
        is_lg, rc, pc = parse_creds(r.get('info'))
        rt = r.get('rating')
        rows.append({
            'listing_id': lid, 'reviewer_name': r.get('name'), 'rating': int(rt) if rt is not None else None,
            'review_text': text[:1500], 'review_date': r.get('date'),
            # Store the BARE Google review id (data-review-id) — the SAME identifier
            # serpapi/dataforseo store. Do NOT prefix with listing id: a prefix makes
            # the id globally unique, so the on_conflict=review_id upsert can never
            # collide with an existing copy of the same review from another source,
            # producing cross-source duplicates (the "g-"/"gsc-" prefix bug). See
            # scripts/audit-duplicate-reviews.mjs + project_review_dedup_cross_source memory.
            'review_id': r['review_id'], 'source': 'gmaps-search-clean',
            'is_touchless_evidence': tl,
            'touchless_keywords': [m.group(0) for m in TOUCHLESS_RE.finditer(text)] or None,
            'reviewer_credentials': r.get('info'), 'reviewer_review_count': rc,
            'reviewer_photo_count': pc, 'reviewer_is_local_guide': is_lg, 'paint_relevant': paint,
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        })
    # dedup by review_id within the batch (Google renders duplicate cards →
    # ON CONFLICT can't touch the same row twice in one statement)
    _seen = set(); rows = [r for r in rows if not (r['review_id'] in _seen or _seen.add(r['review_id']))]
    if rows and not DRY:
        try: sb('POST', '/rest/v1/review_snippets?on_conflict=review_id', body=rows)
        except Exception as e: log(f'  ⚠ {nm}: upsert {str(e)[:60]}')
    stats['ok'] += 1; stats['snip'] += len(rows); stats['tl_listings'] += (1 if tl_n >= 3 else 0)
    log(f"  ✓ {nm:<34} cards={len(reviews)} kept={len(rows)} touchless={tl_n} paint={paint_n}{' ★gate' if tl_n>=3 else ''}")

async def main():
    args = sys.argv[1:]
    def opt(flag, d=None):
        for i, a in enumerate(args):
            if a == flag and i+1 < len(args): return args[i+1]
            if a.startswith(flag + '='): return a.split('=', 1)[1]
        return d
    csv_path = opt('--csv', os.path.join(SCRIPT_DIR, 'tss-mining-targets.csv'))
    limit = int(opt('--limit', '0')); start = int(opt('--start', '0'))
    ids_arg = opt('--ids')
    listing_id_arg = opt('--listing-id')  # one-off: mine a single listing pulled from the DB (no CSV needed)
    global DRY, SCROLLS, RELOADS
    DRY = '--dry' in args; SCROLLS = int(opt('--scrolls', '10')); RELOADS = int(opt('--reloads', '6'))
    headless = '--headless' in args

    targets = []
    if listing_id_arg:
        # ONE-OFF MODE: pull the single listing straight from the DB (used by the
        # mine-one-listing workflow when an admin flips a listing to touchless or
        # creates a new one — it isn't in the static CSV target list).
        rows = sb('GET', f"/rest/v1/listings?select=id,name,city,state,google_place_id&id=eq.{listing_id_arg}")
        if rows and isinstance(rows, list):
            targets = [r for r in rows if (r.get('google_place_id') or '').startswith('ChIJ')]
        if not targets:
            log(f'one-off: listing {listing_id_arg} not found or missing google_place_id — nothing to mine'); return
    else:
        with open(csv_path) as f:
            for row in csv.DictReader(f):
                if (row.get('google_place_id') or '').startswith('ChIJ'): targets.append(row)
        if ids_arg: ids = set(ids_arg.split(',')); targets = [t for t in targets if t['id'] in ids]
        targets = targets[start:]
        if limit: targets = targets[:limit]

    done = set()
    if not ids_arg and not listing_id_arg:
        log('checking already-mined (gmaps-search-clean)...')
        all_ids = [t['id'] for t in targets]
        for i in range(0, len(all_ids), 100):
            rows = sb('GET', f"/rest/v1/review_snippets?select=listing_id&source=eq.gmaps-search-clean&listing_id=in.({','.join(all_ids[i:i+100])})")
            for r in (rows or []):
                if isinstance(r, dict): done.add(r['listing_id'])
        targets = [t for t in targets if t['id'] not in done]
    log(f'targets to mine: {len(targets)} (skipped {len(done)} already-clean) | headless={headless} dry={DRY} scrolls={SCROLLS}')

    stats = dict(ok=0, snip=0, zero=0, fail=0, consent=0, no_tab=0, no_search=0, tl_listings=0)
    UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    RESTART_EVERY = 120  # restart Chromium periodically to avoid memory bloat over a long run
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
                log(f'  -- {idx}/{len(targets)} ok={stats["ok"]} snip={stats["snip"]} gate≥3={stats["tl_listings"]} zero={stats["zero"]} no_tab={stats["no_tab"]} fail={stats["fail"]} --')
            await page.wait_for_timeout(600)
        if browser:
            try: await browser.close()
            except Exception: pass
    log(f'DONE ok={stats["ok"]} snippets={stats["snip"]} gate≥3={stats["tl_listings"]} zero={stats["zero"]} no_tab={stats["no_tab"]} fail={stats["fail"]} consent={stats["consent"]} no_search={stats["no_search"]}')

if __name__ == '__main__':
    asyncio.run(main())
