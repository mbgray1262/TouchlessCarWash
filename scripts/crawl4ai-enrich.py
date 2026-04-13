#!/usr/bin/env python3
"""
Enrich car wash listings by scraping their websites with Crawl4AI.
Extracts hours, amenities, touchless evidence, and testimonials.
Completely free — uses local Playwright browser.

Run: python3 scripts/crawl4ai-enrich.py [--limit 100]
"""
import asyncio, json, re, ssl, urllib.request, datetime, sys, os

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'crawl4ai-enrich.log')

SKIP_DOMAINS = {
    'facebook.com', 'yelp.com', 'google.com', 'instagram.com', 'twitter.com',
    'tiktok.com', 'youtube.com', 'bbb.org', 'mapquest.com', 'yellowpages.com',
    'foursquare.com', 'tripadvisor.com', 'linkedin.com', 'apple.com',
    'edan.io', 'walmart.com', 'costco.com', 'samsclub.com',
}

LIMIT = 100
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


def get_domain(url):
    try:
        from urllib.parse import urlparse
        return urlparse(url).hostname.replace('www.', '').lower()
    except:
        return ''


def should_skip(url):
    if not url: return True
    d = get_domain(url)
    return any(s in d for s in SKIP_DOMAINS)


def extract_hours(text):
    """Try to extract business hours from page content."""
    hours = {}
    days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

    # Pattern: "Monday: 8:00 AM - 10:00 PM" or "Mon-Fri: 7am-9pm"
    for day in days:
        short = day[:3]
        pattern = rf'(?:{day}|{short})[\s:]+(\d{{1,2}}(?::\d{{2}})?\s*(?:AM|PM|am|pm)?)\s*[-–to]+\s*(\d{{1,2}}(?::\d{{2}})?\s*(?:AM|PM|am|pm)?)'
        m = re.search(pattern, text)
        if m:
            hours[day] = f'{m.group(1).strip()} - {m.group(2).strip()}'

    # Check for 24 hours
    if re.search(r'24\s*(?:hours?|hrs?|/\s*7)', text, re.IGNORECASE):
        if not hours:  # Only set all days if we didn't find specific hours
            for day in days:
                hours[day] = 'Open 24 hours'

    return hours if hours else None


def extract_amenities(text):
    """Extract amenities from page content."""
    amenities = []
    lower = text.lower()

    amenity_patterns = {
        'Free Vacuum': r'free\s+vacuum',
        'Self-Serve Bays': r'self[\s-]?serv',
        'Dog Wash': r'(?:dog|pet)\s+wash',
        'RV Wash': r'rv\s+wash',
        'Air Freshener': r'air\s+freshener',
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

    for name, pattern in amenity_patterns.items():
        if re.search(pattern, lower):
            amenities.append(name)

    return amenities if amenities else None


def extract_wash_packages(text):
    """Try to extract wash package names and prices."""
    packages = []
    # Look for patterns like "Package Name ... $X.XX" or "Package Name - $X"
    price_pattern = r'([\w\s&\'-]+?)\s*[-–:]\s*\$(\d+(?:\.\d{2})?)'
    for m in re.finditer(price_pattern, text):
        name = m.group(1).strip()
        price = m.group(2)
        # Filter out non-wash items
        if len(name) > 3 and len(name) < 40 and not any(skip in name.lower() for skip in ['copyright', 'phone', 'address', 'zip']):
            packages.append({'name': name, 'price': f'${price}'})
    return packages[:8] if packages else None


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    log('=' * 60)
    log(f'Crawl4AI Website Enrichment Scanner (limit={LIMIT})')
    log('=' * 60)

    # Get touchless listings missing data, with websites
    log('Loading listings needing enrichment...')
    candidates = []
    offset = 0
    while True:
        # Prioritize listings missing the most data
        rows = sb_req('GET',
            f'/rest/v1/listings?select=id,name,website,city,state,hours,amenities'
            f'&is_touchless=eq.true'
            f'&website=not.is.null'
            f'&order=review_count.desc.nullslast'
            f'&limit=1000&offset={offset}')
        if not rows: break
        for r in rows:
            if should_skip(r.get('website')): continue
            missing_hours = not r.get('hours') or len(r.get('hours', {})) == 0
            missing_amenities = not r.get('amenities') or len(r.get('amenities', [])) == 0
            if missing_hours or missing_amenities:
                candidates.append(r)
        if len(rows) < 1000: break
        offset += 1000

    log(f'Found {len(candidates)} touchless listings needing enrichment')
    batch = candidates[:LIMIT]
    log(f'Processing batch of {len(batch)}')

    config = BrowserConfig(headless=True)
    run_config = CrawlerRunConfig(page_timeout=15000)

    enriched = 0
    errors = 0

    async with AsyncWebCrawler(config=config) as crawler:
        for i, listing in enumerate(batch):
            url = listing['website']
            try:
                result = await crawler.arun(url, config=run_config)

                if result and result.markdown and len(result.markdown) > 100:
                    updates = {}

                    # Extract hours if missing
                    if not listing.get('hours') or len(listing.get('hours', {})) == 0:
                        hours = extract_hours(result.markdown)
                        if hours:
                            updates['hours'] = hours

                    # Extract amenities if missing
                    if not listing.get('amenities') or len(listing.get('amenities', [])) == 0:
                        amenities = extract_amenities(result.markdown)
                        if amenities:
                            updates['amenities'] = amenities

                    # Extract wash packages/pricing if available
                    packages = extract_wash_packages(result.markdown)
                    if packages and (not listing.get('wash_packages') or len(listing.get('wash_packages', [])) == 0):
                        updates['wash_packages'] = packages

                    if updates:
                        sb_req('PATCH', f'/rest/v1/listings?id=eq.{listing["id"]}', updates)
                        enriched += 1
                        extracted = ', '.join(updates.keys())
                        log(f'  ✅ {listing["name"]} — {listing["city"]}, {listing["state"]} ({extracted})')

            except Exception as e:
                errors += 1

            if (i + 1) % 25 == 0:
                log(f'  Progress: {i+1}/{len(batch)} | enriched={enriched} errors={errors}')

            await asyncio.sleep(0.5)

    log('')
    log('=' * 60)
    log('ENRICHMENT COMPLETE')
    log(f'  Scanned:  {len(batch)}')
    log(f'  Enriched: {enriched}')
    log(f'  Errors:   {errors}')
    log('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
