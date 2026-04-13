#!/usr/bin/env python3
"""
Scan gas station car wash websites for touchless evidence using Crawl4AI.

Finds listings with websites that aren't yet tagged touchless, scrapes
each website, and looks for touchless/touch-free/laser wash keywords.
Auto-promotes matches to is_touchless=true.

Completely free — uses local Playwright browser, no API costs.

Run: python3 scripts/crawl4ai-touchless-scan.py [--limit 100] [--dry-run]
"""
import asyncio, json, re, ssl, urllib.request, time, datetime, sys, os

# Supabase config
SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'crawl4ai-touchless-scan.log')
PROGRESS_FILE = os.path.join(SCRIPT_DIR, 'crawl4ai-touchless-scan-progress.json')

# Domains to skip (not actual business websites)
SKIP_DOMAINS = {
    'facebook.com', 'yelp.com', 'google.com', 'instagram.com', 'twitter.com',
    'tiktok.com', 'youtube.com', 'bbb.org', 'mapquest.com', 'yellowpages.com',
    'whitepages.com', 'foursquare.com', 'tripadvisor.com', 'nextdoor.com',
    'linkedin.com', 'apple.com', 'bing.com', 'superpages.com', 'manta.com',
    'chamberofcommerce.com', 'merchantcircle.com', 'angieslist.com',
    'edan.io',  # placeholder sites
}

# Touchless keyword patterns
TOUCHLESS_PATTERNS = [
    # Generic touchless terms
    r'touch[\s-]?less', r'touch[\s-]?free', r'no[\s-]?touch',
    r'laser\s*wash', r'brush[\s-]?less', r'brush[\s-]?free',
    r'contactless\s+wash', r'friction[\s-]?free',
    # PDQ (largest touchless equipment manufacturer)
    r'pdq\s+laserwash', r'pdq\s+tandem', r'pdq\s+access',
    r'laserwash\s*360', r'laserwash\s*g5', r'laserwash\s*4000',
    r'laserwash\s*g5s', r'laserwash\s*360\s*plus',
    # Washworld
    r'washworld\s+razor', r'washworld\s+profile',
    r'washworld\s+razor\s*xl', r'washworld\s+razor\s*max',
    # Mark VII / WashTec
    r'mark\s*vii', r'mark\s*7\b', r'washtec',
    r'choice\s*wash\s*xt', r'choice\s*wash\s*ct', r'aqua\s*jet',
    # Istobal
    r'istobal', r'istobal\s*m[\'\']?nex',
    # D&S (National Carwash Solutions)
    r'd\s*&\s*s\s+car\s*wash', r'national\s+carwash\s+solutions',
    # Oasis
    r'oasis\s+typhoon', r'oasis\s+eclipse',
    # Ryko
    r'ryko\s+softgloss', r'ryko\s+radius',
    # Generic equipment terms that imply touchless
    r'in[\s-]?bay\s+automatic', r'rollover\s+wash',
    r'gantry\s+wash', r'touch[\s-]?free\s+rollover',
]

# Brush/soft-touch patterns (negative signal)
BRUSH_PATTERNS = [
    r'soft[\s-]?touch\s+(wash|auto|car)', r'brush\s+wash',
    r'foam\s+brush', r'cloth\s+wash', r'friction\s+wash',
]

# False positive phrases to exclude before scoring
FALSE_POSITIVES = [
    'touchless payment', 'touchless pay', 'touchless drying',
    'touchless dryer', 'touchless entry', 'touchless exit',
    'touchless ordering', 'touchless checkout',
    'contactless payment', 'contactless pay', 'contactless card',
    'contactless tap', 'contactless transaction', 'contactless delivery',
]

DRY_RUN = '--dry-run' in sys.argv
LIMIT = 100  # default
for arg in sys.argv[1:]:
    if arg.startswith('--limit'):
        LIMIT = int(arg.split('=')[1] if '=' in arg else sys.argv[sys.argv.index(arg) + 1])


def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')


def sb_req(method, path, body=None):
    headers = {
        'apikey': SUPABASE_ANON,
        'Authorization': f'Bearer {SUPABASE_ANON}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    req = urllib.request.Request(
        f'{SUPABASE_URL}{path}',
        data=json.dumps(body).encode() if body else None,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())


def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {'scanned': [], 'promoted': [], 'errors': []}


def save_progress(p):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(p, f)


def get_domain(url):
    try:
        from urllib.parse import urlparse
        return urlparse(url).hostname.replace('www.', '').lower()
    except:
        return ''


def should_skip_url(url):
    if not url:
        return True
    domain = get_domain(url)
    for skip in SKIP_DOMAINS:
        if skip in domain:
            return True
    return False


def analyze_content(text):
    """Check page content for touchless evidence. Returns (is_touchless, evidence, score).

    Now includes negative context detection to avoid false positives like
    "Our wash isn't touchless" or "Is this a touchless wash? No."
    """
    if not text:
        return None, [], 0

    lower = text.lower()

    # Remove false positives
    clean = lower
    for fp in FALSE_POSITIVES:
        clean = clean.replace(fp, '')

    # Check for NEGATIVE touchless context first — these override positive signals
    NEGATIVE_PATTERNS = [
        r"isn['\u2019]?t\s+touchless", r"not\s+touchless", r"not\s+a\s+touchless",
        r"no[,.]?\s+(?:we|our|this).{0,20}(?:isn['\u2019]?t|not|aren['\u2019]?t).{0,20}touchless",
        r"isn['\u2019]?t\s+touch[\s-]?free", r"not\s+touch[\s-]?free",
        r"isn['\u2019]?t\s+brushless", r"not\s+brushless",
        r"(?:is|are)\s+(?:this|we|our).{0,20}touchless.{0,30}(?:no\b|not\b)",
    ]
    for pattern in NEGATIVE_PATTERNS:
        if re.search(pattern, clean):
            return False, [], -10  # Strong negative signal

    touchless_score = 0
    brush_score = 0
    evidence = []

    for pattern in TOUCHLESS_PATTERNS:
        matches = re.findall(pattern, clean)
        if matches:
            touchless_score += len(matches)
            # Extract a snippet around the first match
            m = re.search(pattern, clean)
            if m:
                start = max(0, m.start() - 80)
                end = min(len(text), m.end() + 80)
                snippet = text[start:end].strip()
                evidence.append({'keyword': matches[0], 'snippet': snippet})

    for pattern in BRUSH_PATTERNS:
        matches = re.findall(pattern, clean)
        if matches:
            brush_score += len(matches)

    if touchless_score >= 1 and touchless_score > brush_score:
        return True, evidence, touchless_score
    elif brush_score > 0 and touchless_score == 0:
        return False, [], -brush_score
    elif touchless_score >= 1 and brush_score >= touchless_score:
        # Both touchless and brush mentions — might be a location with both options
        # Only classify as touchless if touchless mentions clearly outnumber brush
        return None, evidence, 0  # Uncertain — needs manual review
    else:
        return None, [], 0


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    log('=' * 60)
    log(f'Crawl4AI Touchless Website Scanner (limit={LIMIT}, dry_run={DRY_RUN})')
    log('=' * 60)

    progress = load_progress()
    scanned_set = set(progress['scanned'])

    # Fetch candidate listings: not touchless, have a website, not already scanned
    log('Loading candidate listings...')
    candidates = []
    offset = 0
    # Filter for listings likely to be car washes (not random businesses with websites)
    car_wash_categories = ['car_wash', 'car wash', 'auto wash', 'carwash']
    while True:
        rows = sb_req('GET',
            f'/rest/v1/listings?select=id,name,website,city,state,google_category'
            f'&is_touchless=not.eq.true'
            f'&website=not.is.null'
            f'&order=review_count.desc.nullslast'
            f'&limit=1000&offset={offset}')
        if not rows:
            break
        for r in rows:
            if r['id'] not in scanned_set and not should_skip_url(r.get('website')):
                # Prioritize actual car wash businesses
                name_lower = (r.get('name') or '').lower()
                category = (r.get('google_category') or '').lower()
                is_car_wash = any(kw in name_lower for kw in ['car wash', 'carwash', 'wash', 'auto wash', 'laser']) or \
                              any(kw in category for kw in car_wash_categories)
                if is_car_wash:
                    candidates.append(r)
        if len(rows) < 1000:
            break
        offset += 1000

    log(f'Found {len(candidates)} candidates with scrapeable websites')
    batch = candidates[:LIMIT]
    log(f'Processing batch of {len(batch)}')

    config = BrowserConfig(headless=True)
    run_config = CrawlerRunConfig(page_timeout=15000)

    promoted = 0
    errors = 0
    scanned = 0

    async with AsyncWebCrawler(config=config) as crawler:
        for i, listing in enumerate(batch):
            url = listing['website']
            lid = listing['id']

            try:
                result = await crawler.arun(url, config=run_config)

                if result and result.markdown and len(result.markdown) > 50:
                    is_touchless, evidence, score = analyze_content(result.markdown)

                    if is_touchless:
                        kw_list = [e['keyword'] for e in evidence[:3]]
                        log(f'  ✅ TOUCHLESS: {listing["name"]} — {listing["city"]}, {listing["state"]} (score={score}, keywords={kw_list})')

                        if not DRY_RUN:
                            sb_req('PATCH', f'/rest/v1/listings?id=eq.{lid}', {
                                'is_touchless': True,
                                'touchless_verified': 'website',
                                'crawl_notes': f'Touchless evidence found on website by Crawl4AI scan. Keywords: {", ".join(kw_list)} (score={score})',
                            })
                        promoted += 1
                    else:
                        pass  # No evidence or brush-only — leave as-is

                scanned += 1
                progress['scanned'].append(lid)
                if is_touchless:
                    progress['promoted'].append({'id': lid, 'name': listing['name'], 'city': listing['city'], 'state': listing['state']})

            except Exception as e:
                err_msg = str(e)[:100]
                errors += 1
                progress['scanned'].append(lid)
                progress['errors'].append({'id': lid, 'url': url, 'error': err_msg})

            if (i + 1) % 25 == 0:
                log(f'  Progress: {i+1}/{len(batch)} | promoted={promoted} errors={errors}')
                save_progress(progress)

            # Small delay to be polite
            await asyncio.sleep(0.5)

    save_progress(progress)

    log('')
    log('=' * 60)
    log('SCAN COMPLETE')
    log(f'  Scanned:  {scanned}')
    log(f'  Promoted: {promoted}')
    log(f'  Errors:   {errors}')
    log(f'  Hit rate: {promoted/max(scanned,1)*100:.1f}%')
    log('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
