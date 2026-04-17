#!/usr/bin/env python3
"""
Add chain locations that are on a chain's authoritative list but missing
from our DB. Enriches each with Google Maps lookup for place_id, coords,
rating, phone.

Reads from scripts/discovery-output/{chain}-locations.json and reconciles
against DB by state+city+street-num+keyword match.
"""
import asyncio, json, re, ssl, urllib.request, os, sys, datetime
from urllib.parse import quote

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

CHAIN = sys.argv[1] if len(sys.argv) > 1 else 'super-wash'
CHAIN_NAME_MAP = {
    'super-wash': "Super Wash",
    'autowash': "Autowash",
}
CHAIN_NAME = CHAIN_NAME_MAP.get(CHAIN, CHAIN)

LOG = f'scripts/add-missing-{CHAIN}.log'


def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG, 'a') as f:
        f.write(line + '\n')


def sb_req(method, path, body=None):
    headers = {'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}',
               'Content-Type': 'application/json', 'Prefer': 'return=representation'}
    req = urllib.request.Request(f'{SUPABASE_URL}{path}',
                                  data=json.dumps(body).encode() if body else None,
                                  headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())


PLACE_ID_RE = re.compile(r'\bChIJ[A-Za-z0-9_-]{20,40}\b')
RATING_RE = re.compile(r'\b([1-5](?:\.\d)?)\s*\(\s*([\d,]+)\s*\)')
LATLNG_RE = re.compile(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)')
PHONE_RE = re.compile(r'\((\d{3})\)\s*(\d{3})-(\d{4})')


def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')


def match(l, auth):
    """Does existing DB listing `l` match authoritative entry `auth`?"""
    if l.get('state') != auth['state']: return False
    c = (l.get('city') or '').lower()
    if auth['city'].lower().split()[0] not in c: return False
    addr = (l.get('address') or '').lower()
    return auth['num'] in addr and auth['key'] in addr


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    with open(f'scripts/discovery-output/{CHAIN}-locations.json') as f:
        authoritative = json.load(f)

    # Load existing DB listings for this chain name (strict).
    # PostgREST wildcard for ilike in URL is '*', not '%'. Spaces must be
    # URL-encoded.
    existing = []
    offset = 0
    encoded_name = CHAIN_NAME.replace(' ', '+')
    while True:
        page = sb_req('GET',
            f'/rest/v1/listings?select=id,name,address,city,state&name=ilike.*{encoded_name}*&limit=1000&offset={offset}')
        if not page: break
        existing.extend(page)
        if len(page) < 1000: break
        offset += 1000

    missing = []
    for auth in authoritative:
        found = next((l for l in existing if match(l, auth)), None)
        if not found:
            missing.append(auth)

    log(f'{len(authoritative)} authoritative, {len(existing)} in DB, {len(missing)} missing → adding')

    config = BrowserConfig(headless=True, viewport_width=1280, viewport_height=900,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')
    run_config = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=3.0)

    added = 0
    async with AsyncWebCrawler(config=config) as crawler:
        for auth in missing:
            q = f"{CHAIN_NAME} {auth['street']} {auth['city']} {auth['state']}"
            url = f'https://www.google.com/maps/search/{quote(q)}'
            try:
                r = await crawler.arun(url, config=run_config)
                blob = (r.markdown or '') + (r.html or '')
                fields = {}
                m = PLACE_ID_RE.search(blob)
                if m: fields['google_place_id'] = m.group(0)
                m = RATING_RE.search(blob)
                if m:
                    try:
                        rating = float(m.group(1)); rc = int(m.group(2).replace(',', ''))
                        if 1.0 <= rating <= 5.0 and 0 < rc < 500_000:
                            fields['rating'] = rating; fields['review_count'] = rc
                    except Exception: pass
                m = LATLNG_RE.search(blob)
                if m:
                    try: fields['latitude'] = float(m.group(1)); fields['longitude'] = float(m.group(2))
                    except Exception: pass
                m = PHONE_RE.search(blob)
                if m: fields['phone'] = f'({m.group(1)}) {m.group(2)}-{m.group(3)}'

                slug = f'{slugify(CHAIN_NAME)}-{slugify(auth["street"])}-{slugify(auth["city"])}-{auth["state"].lower()}'[:100]
                row = {
                    'name': CHAIN_NAME,
                    'address': auth['street'],
                    'city': auth['city'],
                    'state': auth['state'],
                    'zip': auth.get('zip') or '00000',
                    'slug': slug,
                    'is_touchless': True,
                    'is_approved': False,
                    'touchless_verified': 'chain',
                    'parent_chain': CHAIN_NAME,
                    'classification_source': f'imported_apr17_{CHAIN}_authoritative',
                    'crawl_notes': f'Added: location on {CHAIN_NAME} official /locations/ page. Chain-verified touchless. Held at is_approved=false pending enrichment.',
                    **fields,
                }
                try:
                    sb_req('POST', '/rest/v1/listings', row)
                    added += 1
                    log(f'  ✅ {auth["street"]} {auth["city"]}, {auth["state"]} | {list(fields.keys())}')
                except Exception as e:
                    err = str(e)[:120]
                    if 'duplicate key' in err.lower():
                        log(f'  • {auth["street"]} {auth["city"]}, {auth["state"]} | slug already exists')
                    else:
                        log(f'  ❌ {auth["street"]} | {err}')
            except Exception as e:
                log(f'  ❌ fetch: {str(e)[:100]}')
    log(f'\nAdded {added} of {len(missing)} missing {CHAIN_NAME} locations')


if __name__ == '__main__':
    asyncio.run(main())
