#!/usr/bin/env python3
"""
Crawl thin touchless listings to save snapshots and fix indexing.

A listing is "thin" when it has no crawl_snapshot, no extracted_data,
and doesn't meet the review floor (4.0+ rating with 20+ reviews).
Thin listings get noindexed by Google.

By crawling their websites and saving the markdown as crawl_snapshot +
extracting hours/amenities into extracted_data, we make them non-thin
and eligible for Google indexing.

Completely free — uses local Playwright browser.

Run: python3 scripts/crawl4ai-fix-thin.py [--limit 500]
"""
import asyncio, json, re, ssl, urllib.request, datetime, sys, os

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'crawl4ai-fix-thin.log')

SKIP_DOMAINS = {
    'facebook.com', 'yelp.com', 'google.com', 'instagram.com', 'twitter.com',
    'youtube.com', 'bbb.org', 'edan.io', 'linkedin.com', 'apple.com',
    'tiktok.com', 'mapquest.com', 'yellowpages.com', 'foursquare.com',
    'tripadvisor.com', 'walmart.com', 'costco.com',
}

LIMIT = 500
for i, arg in enumerate(sys.argv[1:], 1):
    if arg == '--limit' and i < len(sys.argv) - 1:
        LIMIT = int(sys.argv[i + 1])
    elif arg.startswith('--limit='):
        LIMIT = int(arg.split('=')[1])


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
        data=json.dumps(body).encode() if body else None, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())


def should_skip(url):
    if not url: return True
    try:
        from urllib.parse import urlparse
        d = urlparse(url).hostname.replace('www.', '').lower()
        return any(s in d for s in SKIP_DOMAINS)
    except: return True


def extract_hours(text):
    hours = {}
    days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    for day in days:
        short = day[:3]
        pattern = rf'(?:{day}|{short})[\s:]+(\d{{1,2}}(?::\d{{2}})?\s*(?:AM|PM|am|pm)?)\s*[-–to]+\s*(\d{{1,2}}(?::\d{{2}})?\s*(?:AM|PM|am|pm)?)'
        m = re.search(pattern, text)
        if m:
            hours[day] = f'{m.group(1).strip()} - {m.group(2).strip()}'
    if re.search(r'24\s*(?:hours?|hrs?|/\s*7)', text, re.IGNORECASE):
        if not hours:
            for day in days:
                hours[day] = 'Open 24 hours'
    return hours if hours else None


def extract_amenities(text):
    amenities = []
    lower = text.lower()
    patterns = {
        'Free Vacuum': r'free\s+vacuum',
        'Self-Serve Bays': r'self[\s-]?serv',
        'Dog Wash': r'(?:dog|pet)\s+wash',
        'RV Wash': r'rv\s+wash',
        'Vending': r'vending\s+machine',
        'Tire Shine': r'tire\s+(?:shine|clean)',
        'Undercarriage Wash': r'under(?:carriage|body)',
        'Spot Free Rinse': r'spot[\s-]?free',
        'Ceramic Coating': r'ceramic\s+(?:coat|seal)',
        'Unlimited Wash Club': r'unlimited\s+(?:wash|member|club|plan)',
        'Open 24 Hours': r'(?:24\s*(?:hours?|hrs?|/\s*7)|open\s+24)',
        'Hot Wax': r'hot\s+wax',
        'Triple Foam': r'triple\s+foam',
        'Rain-X': r'rain[\s-]?x',
        'Touchless Automatic': r'touch[\s-]?(?:less|free)\s+(?:auto|wash|car)',
    }
    for name, pattern in patterns.items():
        if re.search(pattern, lower):
            amenities.append(name)
    return amenities if amenities else None


def extract_wash_packages(text):
    packages = []
    price_pattern = r'([\w\s&\'-]+?)\s*[-–:]\s*\$(\d+(?:\.\d{2})?)'
    for m in re.finditer(price_pattern, text):
        name = m.group(1).strip()
        price = m.group(2)
        if len(name) > 3 and len(name) < 40:
            packages.append({'name': name, 'price': f'${price}'})
    return packages[:8] if packages else None


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    log('=' * 60)
    log(f'Crawl4AI Thin Listing Fixer (limit={LIMIT})')
    log('Saves crawl snapshots + extracts data to fix noindex status')
    log('=' * 60)

    # Find thin touchless listings with scrapeable websites
    log('Loading thin listings with websites...')
    candidates = []
    offset = 0
    while True:
        rows = sb_req('GET',
            f'/rest/v1/listings?select=id,name,website,city,state,hours,amenities'
            f'&is_touchless=eq.true'
            f'&crawl_snapshot=is.null'
            f'&extracted_data=is.null'
            f'&website=not.is.null'
            f'&order=review_count.desc.nullslast'
            f'&limit=1000&offset={offset}')
        if not rows: break
        for r in rows:
            if not should_skip(r.get('website')):
                candidates.append(r)
        if len(rows) < 1000: break
        offset += 1000

    log(f'Found {len(candidates)} thin listings with scrapeable websites')
    batch = candidates[:LIMIT]
    log(f'Processing batch of {len(batch)}')

    config = BrowserConfig(headless=True)
    run_config = CrawlerRunConfig(page_timeout=15000)

    fixed = 0
    errors = 0

    async with AsyncWebCrawler(config=config) as crawler:
        for i, listing in enumerate(batch):
            url = listing['website']
            try:
                result = await crawler.arun(url, config=run_config)

                if result and result.markdown and len(result.markdown) > 100:
                    updates = {}

                    # ALWAYS save the crawl snapshot — this is the key fix
                    # Truncate to 50KB to avoid DB bloat, but keep enough for future extraction
                    markdown = result.markdown[:50000]
                    updates['crawl_snapshot'] = {'markdown': markdown, 'url': url, 'crawled_at': datetime.datetime.now().isoformat()}
                    updates['last_crawled_at'] = datetime.datetime.now().isoformat()
                    updates['crawl_status'] = 'crawled'

                    # Also extract structured data while we're here
                    extracted = {}
                    hours = extract_hours(markdown)
                    if hours: extracted['hours'] = hours
                    amenities = extract_amenities(markdown)
                    if amenities: extracted['amenities'] = amenities
                    packages = extract_wash_packages(markdown)
                    if packages: extracted['wash_packages'] = packages

                    if extracted:
                        updates['extracted_data'] = extracted
                        # Also update top-level fields if missing
                        if hours and (not listing.get('hours') or len(listing.get('hours', {})) == 0):
                            updates['hours'] = hours
                        if amenities and (not listing.get('amenities') or len(listing.get('amenities', [])) == 0):
                            updates['amenities'] = amenities

                    sb_req('PATCH', f'/rest/v1/listings?id=eq.{listing["id"]}', updates)
                    fixed += 1

                    extracted_fields = list(extracted.keys()) if extracted else ['snapshot only']
                    if (i + 1) % 10 == 0 or extracted:
                        log(f'  ✅ {listing["name"]} — {listing["city"]}, {listing["state"]} ({", ".join(extracted_fields)})')

            except Exception as e:
                errors += 1

            if (i + 1) % 50 == 0:
                log(f'  Progress: {i+1}/{len(batch)} | fixed={fixed} errors={errors}')

            await asyncio.sleep(0.5)

    log('')
    log('=' * 60)
    log('THIN LISTING FIX COMPLETE')
    log(f'  Scanned:  {len(batch)}')
    log(f'  Fixed:    {fixed} (now have crawl_snapshot → no longer thin)')
    log(f'  Errors:   {errors}')
    log(f'  Remaining thin: ~{len(candidates) - fixed}')
    log('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
