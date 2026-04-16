#!/usr/bin/env python3
"""
Mine Google Maps rating + review_count for today's 46 promoted listings
that have a google_place_id but no rating yet.

Free — uses Crawl4AI against Google Maps place URLs. Extracts
aggregateRating from the page's structured data or visible text patterns.

Run: python3 scripts/mine-ratings-for-apr16.py
"""
import asyncio, json, re, ssl, urllib.request, sys, os, datetime
from urllib.parse import quote

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'mine-ratings-for-apr16.log')


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


# Patterns for "4.5 (127)" or "4.5 stars 127 reviews" style from Google Maps
# Google Maps shows: "4.5\n(127)" or "4.5\n127 reviews"
RATING_PATTERNS = [
    # "4.5 (127)" or "4.5\n(127)"
    re.compile(r'\b([1-5](?:\.\d)?)\s*\(\s*([\d,]+)\s*\)', re.IGNORECASE),
    # "4.5 stars · 127 reviews" or "4.5 rating · 127 reviews"
    re.compile(r'\b([1-5](?:\.\d)?)\s*(?:stars?|rating|★).*?([\d,]+)\s*reviews?', re.IGNORECASE | re.DOTALL),
    # JSON-LD aggregateRating ratingValue + reviewCount
    re.compile(r'"ratingValue"\s*:\s*"?([1-5](?:\.\d)?)"?[^}]*?"reviewCount"\s*:\s*"?([\d]+)"?', re.DOTALL),
]


def extract_rating(md):
    """Return (rating, review_count) if extractable, else (None, None)."""
    for pat in RATING_PATTERNS:
        m = pat.search(md)
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
    log('Mining Google Maps ratings for apr16 promotions')
    log('=' * 60)

    # Load targets: today's apr16 promotions, is_touchless=true, is_approved=false,
    # has google_place_id, and rating/review_count missing
    rows = sb_req('GET',
        '/rest/v1/listings?select=id,name,city,state,google_place_id,rating,review_count'
        '&is_touchless=eq.true'
        '&is_approved=eq.false'
        '&classification_source=like.promoted_apr16%25'
        '&google_place_id=not.is.null')
    # Client-side filter: rating is null OR review_count is null/0
    rows = [r for r in rows if not r.get('rating') or not r.get('review_count')]
    log(f'Loaded {len(rows)} targets')

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
            # Use Google Maps place query format
            url = f'https://www.google.com/maps/place/?q=place_id:{place_id}'
            try:
                result = await crawler.arun(url, config=run_config)
                md = result.markdown or ''
                html = result.html or ''
                blob = md + '\n' + html
                rating, rc = extract_rating(blob)
                if rating and rc:
                    sb_req('PATCH', f'/rest/v1/listings?id=eq.{l["id"]}',
                           {'rating': rating, 'review_count': rc})
                    log(f'  [{i+1}/{len(rows)}] ✅ {l["name"][:30]:<30} {l["city"]}, {l["state"]} | {rating} ({rc})')
                    found += 1
                else:
                    log(f'  [{i+1}/{len(rows)}] ⚠️  {l["name"][:30]:<30} {l["city"]}, {l["state"]} | no rating extracted')
                done += 1
            except Exception as e:
                log(f'  [{i+1}/{len(rows)}] ❌ {l["name"][:30]:<30} | {str(e)[:80]}')
                errors += 1

    log('=' * 60)
    log(f'Done: processed={done} found_rating={found} errors={errors}')
    log('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
