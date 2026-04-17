#!/usr/bin/env python3
"""
Add the 4 authoritative Haffner's touchless locations missing from our DB.
Uses Google Maps search to enrich each with place_id, lat/lng, rating,
real website (per-location page on haffners.com), phone.

Held at is_approved=false until full enrichment completes.
"""
import asyncio, json, re, ssl, urllib.request, os, datetime
from urllib.parse import quote

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

LOG_FILE = os.path.join(os.path.dirname(__file__), 'add-missing-haffners.log')


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


MISSING = [
    {'name': "Haffner's Car Wash", 'address': '374 Tenney Mountain Highway', 'city': 'Plymouth', 'state': 'NH', 'zip': '03264',
     'website': 'https://www.haffners.com/car-washes/plymouth-nh'},
    {'name': "Haffner's Car Wash", 'address': '55 Riverside Street', 'city': 'Portland', 'state': 'ME', 'zip': '04103',
     'website': 'https://www.haffners.com/car-washes/portland-me'},
    {'name': "Haffner's Car Wash", 'address': '309 NH-104', 'city': 'New Hampton', 'state': 'NH', 'zip': '03256',
     'website': 'https://www.haffners.com/car-washes/new-hampton-nh'},
    {'name': "Haffner's Car Wash", 'address': '425 Merrimack Street', 'city': 'Lawrence', 'state': 'MA', 'zip': '01843',
     'website': 'https://www.haffners.com/car-washes/lawrence-ma'},
]


PLACE_ID_PATTERN = re.compile(r'\bChIJ[A-Za-z0-9_-]{20,40}\b')
RATING_PATTERN = re.compile(r'\b([1-5](?:\.\d)?)\s*\(\s*([\d,]+)\s*\)')
LATLNG_PATTERN = re.compile(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)')
PHONE_PATTERN = re.compile(r'\((\d{3})\)\s*(\d{3})-(\d{4})')


def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
    config = BrowserConfig(headless=True, viewport_width=1280, viewport_height=900,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')
    run_config = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=3.0)

    added = 0
    async with AsyncWebCrawler(config=config) as crawler:
        for m in MISSING:
            q = quote(f"Haffner's Car Wash {m['address']} {m['city']} {m['state']}")
            url = f'https://www.google.com/maps/search/{q}'
            log(f"Looking up: {m['address']} {m['city']}, {m['state']}")
            r = await crawler.arun(url, config=run_config)
            blob = (r.markdown or '') + (r.html or '')

            fields = {}
            pm = PLACE_ID_PATTERN.search(blob)
            if pm: fields['google_place_id'] = pm.group(0)
            rm = RATING_PATTERN.search(blob)
            if rm:
                try:
                    rating = float(rm.group(1))
                    rc = int(rm.group(2).replace(',', ''))
                    if 1.0 <= rating <= 5.0 and 0 < rc < 500_000:
                        fields['rating'] = rating
                        fields['review_count'] = rc
                except Exception:
                    pass
            lm = LATLNG_PATTERN.search(blob)
            if lm:
                try:
                    fields['latitude'] = float(lm.group(1))
                    fields['longitude'] = float(lm.group(2))
                except Exception:
                    pass
            phm = PHONE_PATTERN.search(blob)
            if phm:
                fields['phone'] = f'({phm.group(1)}) {phm.group(2)}-{phm.group(3)}'

            # Build row
            slug = f"{slugify(m['name'])}-{slugify(m['address'])}-{slugify(m['city'])}-{m['state'].lower()}"[:100]
            row = {
                'name': m['name'],
                'address': m['address'],
                'city': m['city'],
                'state': m['state'],
                'zip': m['zip'],
                'slug': slug,
                'website': m['website'],
                'is_touchless': True,
                'is_approved': False,
                'touchless_verified': 'chain',
                'parent_chain': "Haffner's",
                'classification_source': 'imported_apr17_haffners_authoritative',
                'crawl_notes': 'Added: location is on the official haffners.com/car-washes/Touchless-Car-Washes list. Chain-verified touchless. Holding at is_approved=false until enrichment pipeline populates hours, amenities, hero image.',
                **fields,
            }
            try:
                sb_req('POST', '/rest/v1/listings', row)
                log(f"  ✅ Added: {m['address']} {m['city']}, {m['state']} | fields: {list(fields.keys())}")
                added += 1
            except Exception as e:
                log(f"  ❌ Failed: {str(e)[:200]}")
    log(f"\nAdded {added} of {len(MISSING)} missing Haffner's locations")


if __name__ == '__main__':
    asyncio.run(main())
