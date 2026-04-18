#!/usr/bin/env python3
"""
Google Maps photo harvester for held listings.

For each held listing with a google_place_id but no good hero_image,
scrape user-submitted photos from its Google Maps page and set the best
one as hero_image. Zero API cost — free browser scraping.

Pipeline:
  1. Fetch held listings without hero_image (or with bad/SV hero)
  2. Navigate to Google Maps place page with Crawl4AI
  3. Extract all /p/AF1Qi... photo URLs (customer-submitted, permanent)
  4. Score candidates, reject thumbnails / Street View / icons
  5. Set best as hero_image, store alternates in photos[] as fallbacks
  6. Later: text-verifier re-runs and approves any that now qualify

Usage: python3 scripts/harvest-gmaps-photos.py [--limit N] [--dry-run]
                                                [--ids id1,id2] [--force]
"""
import asyncio, json, sys, os, re, datetime, ssl, urllib.request
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
SSL_CTX = ssl.create_default_context(); SSL_CTX.check_hostname = False; SSL_CTX.verify_mode = ssl.CERT_NONE

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'harvest-gmaps-photos.log')

LIMIT = 0
DRY_RUN = False
FORCE = False
IDS_ARG = None

for i, a in enumerate(sys.argv[1:], 1):
    if a == '--limit' and i < len(sys.argv)-1: LIMIT = int(sys.argv[i+1])
    elif a.startswith('--limit='): LIMIT = int(a.split('=')[1])
    elif a == '--dry-run': DRY_RUN = True
    elif a == '--force': FORCE = True
    elif a.startswith('--ids='): IDS_ARG = a.split('=',1)[1].split(',')


def log(m):
    line = f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {m}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f: f.write(line + '\n')


def sb_get(path):
    req = urllib.request.Request(f'{SUPABASE_URL}{path}',
        headers={'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}'})
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        return json.loads(r.read())


def sb_patch(path, body):
    req = urllib.request.Request(f'{SUPABASE_URL}{path}',
        data=json.dumps(body).encode(),
        headers={'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}',
                 'Content-Type':'application/json', 'Prefer':'return=minimal'},
        method='PATCH')
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        return r.status


# ============ Photo extraction ============

# Reject patterns (always bad)
URL_REJECT = [
    'streetviewpixels-pa.googleapis.com',  # Street View thumbs
    'maps/api/streetview',
    '/avatar', 'user_avatar', 'profile/p/',
    '/icon', '/logo', '/favicon',
    'sprite', 'placeholder', 'markers.png',
    'gps-cs-s/',  # Google dynamic session photos (expire)
]


def extract_photos_from_html(html):
    """Pull user-submitted Google Maps photos (/p/AF1Qi... format)."""
    if not html: return []
    photos = set()

    # Permanent Google Maps user photos
    for m in re.finditer(r'https://lh\d\.googleusercontent\.com/p/[A-Za-z0-9_-]+(?:=[^\s"\'<>)]+)?', html):
        u = m.group(0)
        # Skip if matches reject patterns
        if any(r in u.lower() for r in URL_REJECT): continue
        # Upgrade tiny thumbnail size to full
        # Replace =w### or =s### with w1600
        u = re.sub(r'=w\d+(?:-h\d+)?(?:-[a-z-]+)?$', '=w1600-h1200-k-no', u)
        if not re.search(r'=w|=s', u):
            u += '=w1600-h1200-k-no'
        photos.add(u)

    return list(photos)


def score_photo(url):
    """Positive = worth using. Negative = reject."""
    url_l = url.lower()
    for r in URL_REJECT:
        if r in url_l: return -100
    score = 0
    # Prefer permanent /p/ customer photos
    if '/p/af1qi' in url_l: score += 20
    # Size boost from URL params
    m = re.search(r'=w(\d+)', url_l)
    if m:
        w = int(m.group(1))
        if w >= 1200: score += 15
        elif w >= 800: score += 8
        elif w < 400: score -= 30
    return score


def pick_best(photos):
    scored = [(score_photo(p), p) for p in photos]
    scored.sort(reverse=True)
    good = [p for s, p in scored if s > 0]
    return (good[0] if good else None), good[1:6]  # best + up to 5 alternates


# ============ Main scrape logic ============

async def harvest_one(crawler, listing, stats):
    lid = listing['id']
    place_id = listing.get('google_place_id')
    name = (listing.get('name') or '')[:40]

    url = f'https://www.google.com/maps/place/?q=place_id:{place_id}'
    try:
        result = await crawler.arun(url, config=CrawlerRunConfig(
            page_timeout=30000, delay_before_return_html=3.0,
            simulate_user=True, override_navigator=True, magic=True,
            cache_mode=CacheMode.BYPASS, verbose=False,
            # Click "See photos" and wait for photos panel
            js_code=["""
                await new Promise(r => setTimeout(r, 1500));
                // Try to click "See photos" or photo gallery trigger
                const photoBtns = Array.from(document.querySelectorAll('button, a')).filter(el => {
                    const t = (el.innerText || el.ariaLabel || '').toLowerCase();
                    return t.includes('photos') || t.includes('see photos') || t.includes('view photo');
                });
                for (const b of photoBtns.slice(0, 2)) { try { b.click(); } catch(e){} }
                await new Promise(r => setTimeout(r, 2000));
            """],
        ))
        if not result or not result.success:
            stats['fail'] += 1
            return None
        photos_raw = extract_photos_from_html(result.html or '')
        if not photos_raw:
            stats['no_photos'] += 1
            return None
        best, alts = pick_best(photos_raw)
        if not best:
            stats['no_good_photo'] += 1
            return None
        stats['got_hero'] += 1
        return {'best': best, 'alts': alts, 'count': len(photos_raw)}
    except Exception as e:
        stats['fail'] += 1
        log(f'  ❌ {lid[:8]} {name}: {str(e)[:120]}')
        return None


async def main():
    log('=' * 60)
    log(f'GMAPS PHOTO HARVESTER — dry={DRY_RUN} limit={LIMIT or "none"} force={FORCE}')
    log('=' * 60)

    # Target listings
    if IDS_ARG:
        targets = []
        for i in range(0, len(IDS_ARG), 50):
            chunk = ','.join(IDS_ARG[i:i+50])
            rows = sb_get(f'/rest/v1/listings?select=id,name,google_place_id,hero_image&id=in.({chunk})')
            targets.extend(rows)
    else:
        # Held listings with place_id
        targets = []
        offset = 0
        while True:
            rows = sb_get(f'/rest/v1/listings?select=id,name,google_place_id,hero_image&is_touchless=eq.true&is_approved=eq.false&google_place_id=not.is.null&limit=1000&offset={offset}')
            if not rows: break
            targets.extend(rows)
            if len(rows) < 1000: break
            offset += 1000

    log(f'Held listings with place_id: {len(targets)}')

    # Filter: only ones WITHOUT hero_image (unless --force)
    if not FORCE:
        targets = [t for t in targets if not t.get('hero_image')]
        log(f'After filtering those with hero already: {len(targets)}')

    if LIMIT > 0: targets = targets[:LIMIT]
    log(f'Processing {len(targets)} listings')

    browser_cfg = BrowserConfig(headless=True, java_script_enabled=True, ignore_https_errors=True, verbose=False)
    stats = {'done':0, 'got_hero':0, 'no_photos':0, 'no_good_photo':0, 'fail':0}
    today = datetime.date.today().isoformat()

    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        for idx, l in enumerate(targets):
            result = await harvest_one(crawler, l, stats)
            stats['done'] += 1

            if idx % 15 == 0 and idx > 0:
                log(f'  {idx}/{len(targets)} got_hero={stats["got_hero"]} no_photos={stats["no_photos"]} fail={stats["fail"]}')

            if not result: continue
            if DRY_RUN:
                log(f'  [DRY] {l["id"][:8]} {l["name"][:35]:<35} → hero: {result["best"][:80]}...')
                continue

            # Apply: set hero + store alternates in photos[]
            body = {
                'hero_image': result['best'],
                'hero_image_source': 'gmaps-harvested',
                'photos': result['alts'] if result['alts'] else None,
                'crawl_notes': f'[{today}] Hero harvested from Google Maps user photos ({result["count"]} candidates). Text-verifier will re-check for approval.'
            }
            try:
                sb_patch(f'/rest/v1/listings?id=eq.{l["id"]}', body)
                log(f'  ✓ {l["id"][:8]} {l["name"][:35]:<35} → hero set ({result["count"]} photos)')
            except Exception as e:
                stats['fail'] += 1
                log(f'  ❌ {l["id"][:8]} patch failed: {str(e)[:100]}')

            # Polite delay
            await asyncio.sleep(1)

    log('=' * 60)
    log(f'COMPLETE: {stats["done"]}/{len(targets)}')
    log(f'  got_hero:     {stats["got_hero"]}')
    log(f'  no_photos:    {stats["no_photos"]}')
    log(f'  no_good_photo:{stats["no_good_photo"]}')
    log(f'  failures:     {stats["fail"]}')


if __name__ == '__main__':
    asyncio.run(main())
