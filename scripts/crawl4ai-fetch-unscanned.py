#!/usr/bin/env python3
"""
Fetches website content via Crawl4AI for listings that have a website URL
but no crawl_snapshot yet. Stores raw content in crawl_snapshot — does NOT
classify. Classification is a separate pass using scripts/rescan-snapshots-v2.mjs
so we get the benefit of the strict classifier (compound phrases, curly-apostrophe
negation, mixed-offer rejection, tunnel-chain filter).

Run: python3 scripts/crawl4ai-fetch-unscanned.py --limit 2000
"""
import asyncio, json, ssl, urllib.request, sys, os, datetime
from urllib.parse import urlparse

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'crawl4ai-fetch-unscanned.log')

SKIP_DOMAINS = {
    'facebook.com', 'yelp.com', 'google.com', 'instagram.com', 'twitter.com',
    'tiktok.com', 'youtube.com', 'bbb.org', 'mapquest.com', 'yellowpages.com',
    'whitepages.com', 'foursquare.com', 'tripadvisor.com', 'nextdoor.com',
    'linkedin.com', 'apple.com', 'bing.com', 'superpages.com', 'manta.com',
    'chamberofcommerce.com', 'merchantcircle.com', 'angieslist.com',
    'edan.io', 'walmart.com', 'costco.com',
    # Gas station corporate sites — location-specific URLs only get generic marketing
    # If URL is station-specific (has station id), still OK
}

LIMIT = 2000
for i, arg in enumerate(sys.argv[1:]):
    if arg.startswith('--limit='):
        LIMIT = int(arg.split('=')[1])
    elif arg == '--limit' and i + 1 < len(sys.argv) - 1:
        LIMIT = int(sys.argv[i + 2])


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


def get_domain(url):
    try:
        h = urlparse(url).hostname
        return h.replace('www.', '').lower() if h else ''
    except:
        return ''


def should_skip(url):
    if not url:
        return True
    d = get_domain(url)
    return any(skip in d for skip in SKIP_DOMAINS)


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    log('=' * 60)
    log(f'Crawl4AI Fetch-Only Scanner (limit={LIMIT})')
    log('Purpose: populate crawl_snapshot on unclassified listings with websites')
    log('         so our strict v2 classifier can run against real data')
    log('=' * 60)

    # Get unclassified listings with website but no snapshot
    log('Loading candidates...')
    candidates = []
    offset = 0
    while True:
        # Supabase .or() syntax for null OR false
        rows = sb_req('GET',
            f'/rest/v1/listings?select=id,name,website,city,state'
            f'&or=(is_touchless.is.null,is_touchless.eq.false)'
            f'&website=not.is.null'
            f'&crawl_snapshot=is.null'
            f'&order=review_count.desc.nullslast'
            f'&limit=1000&offset={offset}')
        if not rows:
            break
        for r in rows:
            if should_skip(r.get('website')):
                continue
            candidates.append(r)
        if len(rows) < 1000:
            break
        offset += 1000
        if len(candidates) >= LIMIT * 2:
            break

    batch = candidates[:LIMIT]
    log(f'Processing {len(batch)} listings (out of {len(candidates)} eligible)')

    config = BrowserConfig(headless=True)
    run_config = CrawlerRunConfig(page_timeout=20000)

    fetched = 0
    errors = 0
    skipped = 0

    async with AsyncWebCrawler(config=config) as crawler:
        for i, listing in enumerate(batch):
            url = listing['website']
            try:
                result = await crawler.arun(url, config=run_config)
                if result and result.markdown and len(result.markdown) > 100:
                    # Build crawl_snapshot payload
                    snap = {
                        'data': {
                            'markdown': result.markdown[:200000],  # cap at 200KB
                            'text': (result.text or '')[:100000] if hasattr(result, 'text') else '',
                        },
                        'source': 'crawl4ai-fetch-apr15',
                        'success': True,
                        'crawled_at': datetime.datetime.utcnow().isoformat() + 'Z',
                        'url': url,
                    }
                    sb_req('PATCH', f'/rest/v1/listings?id=eq.{listing["id"]}',
                           {'crawl_snapshot': snap, 'last_crawled_at': snap['crawled_at']})
                    fetched += 1
                else:
                    skipped += 1
            except Exception as e:
                errors += 1
                if errors >= 20:
                    log(f'Too many errors, stopping at {i+1}/{len(batch)}')
                    break
                continue

            if (i + 1) % 50 == 0:
                log(f'  [{i+1}/{len(batch)}] fetched={fetched} skipped={skipped} errors={errors}')

    log('=' * 60)
    log(f'DONE. Fetched: {fetched}. Skipped (thin content): {skipped}. Errors: {errors}')
    log('Next: run scripts/rescan-snapshots-v2.mjs to classify these new snapshots')
    log('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
