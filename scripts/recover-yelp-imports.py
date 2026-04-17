#!/usr/bin/env python3
"""
Recover the 94 Yelp-imported listings by fetching their Google Maps
place page via name+address search, then extracting:
  - google_place_id  (for future rating refresh + nearby discovery)
  - latitude / longitude
  - rating / review_count
  - real business website URL (replaces the Yelp URL placeholder)
  - phone
  - hours (from embedded JSON if present)

For each listing:
  1. Build Google Maps URL: /maps/place/?q={name}+{address}+{city}+{state}
  2. Crawl the result
  3. Extract place_id from ChIJ pattern in URL / HTML
  4. Extract rating pattern
  5. Look for biz website link in the sidebar data

Free — Crawl4AI only.

Run: python3 scripts/recover-yelp-imports.py
"""
import asyncio, json, re, ssl, urllib.request, sys, os, datetime
from urllib.parse import quote

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'recover-yelp-imports.log')


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


# Place_id (ChIJ...) — may or may not appear on search-result pages; nice-to-have
PLACE_ID_PATTERN = re.compile(r'\bChIJ[A-Za-z0-9_-]{20,40}\b')
# Rating: "4.6(434)" or "4.6 (434 reviews)"
RATING_PATTERN = re.compile(r'\b([1-5](?:\.\d)?)\s*\(\s*([\d,]+)\s*\)')
# Business website — filter out known non-business domains
WEBSITE_EXCLUDE = re.compile(r'^(?:(?:www\.|apis\.|csi\.|ssl\.|fonts\.|lh\d+\.)?(?:google|gstatic|googleusercontent|goo\.gl|maps\.|yelp|facebook|instagram|tiktok|twitter|x\.com|youtube|accounts\.google|googleapis)\.)', re.IGNORECASE)
WEBSITE_PATTERN = re.compile(r'https?://([a-zA-Z0-9.-]+\.(?:com|net|org|co|us|biz|store|shop))(/[^"\s<>]*)?')
# Phone
PHONE_PATTERN = re.compile(r'\((\d{3})\)\s*(\d{3})-(\d{4})')
# Lat/Lng — Maps search results embed coords as !3d{lat}!4d{lng}
LATLNG_PATTERN = re.compile(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)')


def pick_website(blob):
    """Find the first candidate business website URL in the page blob,
    filtering out Google infrastructure and known social/CDN domains."""
    seen = set()
    for m in WEBSITE_PATTERN.finditer(blob):
        host = m.group(1)
        url = m.group(0)
        if host in seen: continue
        seen.add(host)
        if WEBSITE_EXCLUDE.match(host):
            continue
        # Skip font CDNs that leaked through
        if any(bad in host for bad in ['gstatic', 'gvt1', 'gvt2', 'googlesyndication', 'doubleclick', 'googletagmanager']):
            continue
        # Skip obvious analytics/tracker
        if any(tld in host for tld in ['.googleapis.', '.hotjar.', '.segment.']):
            continue
        # Sanity check length
        if len(url) > 150: continue
        return url.split('?')[0].split('#')[0]  # strip query/fragment
    return None


def extract_fields(blob, fallback_state=None):
    result = {}
    m = PLACE_ID_PATTERN.search(blob)
    if m: result['google_place_id'] = m.group(0)
    m = RATING_PATTERN.search(blob)
    if m:
        try:
            rating = float(m.group(1))
            rc = int(m.group(2).replace(',', ''))
            if 1.0 <= rating <= 5.0 and 0 < rc < 500_000:
                result['rating'] = rating
                result['review_count'] = rc
        except (ValueError, IndexError):
            pass
    m = LATLNG_PATTERN.search(blob)
    if m:
        try:
            lat, lng = float(m.group(1)), float(m.group(2))
            if 17 <= lat <= 72 and -180 <= lng <= -60:
                result['latitude'] = lat
                result['longitude'] = lng
        except ValueError:
            pass
    web = pick_website(blob)
    if web:
        result['website'] = web
    m = PHONE_PATTERN.search(blob)
    if m:
        result['phone'] = f'({m.group(1)}) {m.group(2)}-{m.group(3)}'
    return result


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    log('=' * 60)
    log('Recover Yelp-imported listings via Google Maps')
    log('=' * 60)

    # Load the 94 Yelp-imported held listings
    rows = sb_req('GET',
        '/rest/v1/listings?select=id,name,address,city,state,website,google_place_id,rating,review_count,latitude,longitude'
        '&is_touchless=eq.true'
        '&is_approved=eq.false'
        '&classification_source=eq.imported_apr16_yelp_new_business')
    log(f'Loaded {len(rows)} Yelp-imported listings')

    config = BrowserConfig(
        headless=True,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport_width=1280, viewport_height=900,
    )
    run_config = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=3.0)

    updated = 0
    no_match = 0
    errors = 0
    consecutive_errors = 0

    async with AsyncWebCrawler(config=config) as crawler:
        for i, l in enumerate(rows):
            # Use /maps/search/ format — returns richer structured data
            # than /maps/place/?q= (includes !3d!4d coords and place cards)
            search_q = f"{l['name']} {l.get('address', '') or ''} {l.get('city', '')} {l.get('state', '')}".strip()
            url = f'https://www.google.com/maps/search/{quote(search_q)}'
            try:
                result = await crawler.arun(url, config=run_config)
                blob = (result.markdown or '') + '\n' + (result.html or '')
                if len(blob) < 5000:
                    errors += 1
                    consecutive_errors += 1
                    if consecutive_errors >= 3:
                        log(f'    ⏸  {consecutive_errors} errors — sleeping 60s')
                        await asyncio.sleep(60)
                        consecutive_errors = 0
                    continue
                consecutive_errors = 0

                fields = extract_fields(blob, fallback_state=l.get('state'))
                # Accept a match if we got lat/lng OR place_id — either is a
                # solid anchor. Missing place_id from search-result pages is
                # common; /maps/search/ doesn't always emit ChIJ strings.
                if not fields.get('google_place_id') and not fields.get('latitude'):
                    no_match += 1
                    if (i + 1) % 10 == 0:
                        log(f'  [{i+1}/{len(rows)}] ⚠️  no match: {l["name"][:30]:<30}')
                    continue

                # Build patch — only set fields that aren't already populated, EXCEPT website
                # (we override the Yelp URL placeholder with the real business URL if found)
                patch = {}
                if fields.get('google_place_id') and not l.get('google_place_id'):
                    patch['google_place_id'] = fields['google_place_id']
                if fields.get('rating') and not l.get('rating'):
                    patch['rating'] = fields['rating']
                if fields.get('review_count') and not l.get('review_count'):
                    patch['review_count'] = fields['review_count']
                if fields.get('latitude') and not l.get('latitude'):
                    patch['latitude'] = fields['latitude']
                if fields.get('longitude') and not l.get('longitude'):
                    patch['longitude'] = fields['longitude']
                # Website: replace if current one is a Yelp URL
                if fields.get('website') and l.get('website', '').startswith('https://www.yelp.com/'):
                    patch['website'] = fields['website']
                if fields.get('phone') and not l.get('phone'):
                    patch['phone'] = fields['phone']

                if patch:
                    sb_req('PATCH', f'/rest/v1/listings?id=eq.{l["id"]}', patch)
                    updated += 1
                    log(f'  [{i+1}/{len(rows)}] ✅ {l["name"][:30]:<30} {l["city"]}, {l["state"]} | {list(patch.keys())}')
                else:
                    log(f'  [{i+1}/{len(rows)}] • {l["name"][:30]:<30} (all fields already set)')

                if (i + 1) % 20 == 0:
                    log(f'    ── progress: {i+1}/{len(rows)}  updated:{updated}  no_match:{no_match}  errors:{errors} ──')
            except Exception as e:
                errors += 1
                log(f'  [{i+1}/{len(rows)}] ❌ {l["name"][:30]:<30} | {str(e)[:80]}')

    log('=' * 60)
    log(f'Yelp recovery complete:')
    log(f'  updated: {updated}')
    log(f'  no place_id found: {no_match}')
    log(f'  errors: {errors}')
    log('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
