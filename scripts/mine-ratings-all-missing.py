#!/usr/bin/env python3
"""
Mine Google Maps rating + review_count for ALL is_touchless=true listings
that have a rating but review_count is 0 or null.

Targets ~384 listings missing review counts so their aggregateRating can
be emitted to search engines (enabling star-ratings in SERPs).

Free — Crawl4AI against Google Maps place URLs.

Run: python3 scripts/mine-ratings-all-missing.py [--limit N] [--skip N]
"""
import asyncio, json, re, ssl, urllib.request, sys, os, datetime
from urllib.parse import quote

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'mine-ratings-all-missing.log')

LIMIT = 0  # 0 = no limit
SKIP = 0
for arg in sys.argv[1:]:
    if arg.startswith('--limit='):
        LIMIT = int(arg.split('=')[1])
    elif arg.startswith('--skip='):
        SKIP = int(arg.split('=')[1])


def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')


def sb_req(method, path, body=None):
    headers = {'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}',
               'Content-Type': 'application/json', 'Prefer': 'return=representation'}
    req = urllib.request.Request(f'{SUPABASE_URL}{path}',
                                  data=json.dumps(body).encode() if body else None,
                                  headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())


# Patterns for "4.5 (127)" or JSON-LD aggregateRating from Google Maps page
RATING_PATTERNS = [
    re.compile(r'\b([1-5](?:\.\d)?)\s*\(\s*([\d,]+)\s*\)'),
    re.compile(r'\b([1-5](?:\.\d)?)\s*(?:stars?|rating|★).*?([\d,]+)\s*reviews?', re.IGNORECASE | re.DOTALL),
    re.compile(r'"ratingValue"\s*:\s*"?([1-5](?:\.\d)?)"?[^}]*?"reviewCount"\s*:\s*"?([\d]+)"?', re.DOTALL),
]


def extract_rating(blob):
    for pat in RATING_PATTERNS:
        m = pat.search(blob)
        if m:
            try:
                rating = float(m.group(1))
                rc = int(m.group(2).replace(',', ''))
                if 1.0 <= rating <= 5.0 and 0 < rc < 500_000:
                    return rating, rc
            except (ValueError, IndexError):
                continue
    return None, None


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    log('=' * 60)
    log(f'Mining Google Maps ratings for ALL touchless listings missing review_count')
    log(f'LIMIT={LIMIT if LIMIT else "no limit"} SKIP={SKIP}')
    log('=' * 60)

    # Load targets: is_touchless=true, rating > 0, has google_place_id,
    # review_count is 0 or null. PostgREST: use or=() with eq/is filters.
    # Paginate to handle >1000 rows.
    rows = []
    offset = 0
    while True:
        page = sb_req('GET',
            '/rest/v1/listings?select=id,name,city,state,google_place_id,rating,review_count'
            '&is_touchless=eq.true'
            '&rating=gt.0'
            '&google_place_id=not.is.null'
            f'&limit=1000&offset={offset}')
        if not page: break
        # Client-side filter — need review_count null OR 0
        for r in page:
            if not r.get('review_count'):  # None, 0 all falsy
                rows.append(r)
        if len(page) < 1000: break
        offset += 1000

    log(f'Loaded {len(rows)} targets')

    # Apply skip + limit
    if SKIP > 0:
        rows = rows[SKIP:]
        log(f'After skip: {len(rows)} targets')
    if LIMIT > 0:
        rows = rows[:LIMIT]
        log(f'After limit: {len(rows)} targets')

    config = BrowserConfig(
        headless=True,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport_width=1280, viewport_height=900,
    )
    run_config = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=3.0)

    done = 0
    found = 0
    errors = 0

    async with AsyncWebCrawler(config=config) as crawler:
        for i, l in enumerate(rows):
            place_id = l['google_place_id']
            url = f'https://www.google.com/maps/place/?q=place_id:{place_id}'
            try:
                result = await crawler.arun(url, config=run_config)
                md = result.markdown or ''
                html = result.html or ''
                blob = md + '\n' + html
                rating, rc = extract_rating(blob)
                if rating and rc:
                    # Preserve existing rating if different — prefer the one from Maps
                    patch = {'rating': rating, 'review_count': rc}
                    sb_req('PATCH', f'/rest/v1/listings?id=eq.{l["id"]}', patch)
                    log(f'  [{i+1}/{len(rows)}] ✅ {l["name"][:30]:<30} {l["city"]}, {l["state"]} | {rating} ({rc})')
                    found += 1
                else:
                    log(f'  [{i+1}/{len(rows)}] ⚠️  {l["name"][:30]:<30} {l["city"]}, {l["state"]} | no rating extracted')
                done += 1
                # Progress checkpoint every 25
                if done % 25 == 0:
                    log(f'    ── progress: {done}/{len(rows)} done, {found} found, {errors} errors ──')
            except Exception as e:
                log(f'  [{i+1}/{len(rows)}] ❌ {l["name"][:30]:<30} | {str(e)[:80]}')
                errors += 1
                done += 1

    log('=' * 60)
    log(f'Done: processed={done} found_rating={found} errors={errors}')
    log('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
