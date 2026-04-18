#!/usr/bin/env python3
"""
MapQuest Place Search API — discover touchless car washes across US metros.

Uses MapQuest v4 Place Search (MAPQUEST_KEY in .env.local, 15k free lifetime).
For each of ~200 US metros:
  1. Query "touchless car wash" — direct matches (businesses with touchless in name)
  2. Query "touch free car wash"
  3. Query "laser car wash"
  4. Query "brushless car wash"

Results are name-based matches, so any result is definitively touchless-branded.
Deduplicate against DB by address + lat/lng, insert missing.

~200 metros × 4 queries = 800 API calls (well under 15k budget).
"""
import json, os, re, ssl, urllib.request, urllib.parse, datetime, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed

SCRIPT_DIR = os.path.dirname(__file__)
ENV_FILE = os.path.join(os.path.dirname(SCRIPT_DIR), '.env.local')
# Load env
ENV = {}
for line in open(ENV_FILE):
    if '=' in line and not line.startswith('#'):
        k, v = line.strip().split('=', 1)
        ENV[k] = v
MAPQUEST_KEY = ENV.get('MAPQUEST_KEY')
SUPABASE_URL = ENV.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_ANON = ENV.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

SSL_CTX = ssl.create_default_context(); SSL_CTX.check_hostname=False; SSL_CTX.verify_mode=ssl.CERT_NONE
OUT_FILE = os.path.join(SCRIPT_DIR, 'discovery-output', 'mapquest-washes.json')
LOG_FILE = os.path.join(SCRIPT_DIR, 'discover-mapquest.log')

DRY_RUN = '--dry-run' in sys.argv
INSERT = '--insert' in sys.argv


def log(m):
    line = f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {m}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f: f.write(line+'\n')


def sb_req(method, path, body=None):
    headers = {'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}', 'Content-Type':'application/json'}
    if method in ('POST','PATCH'): headers['Prefer'] = 'return=minimal'
    req = urllib.request.Request(f'{SUPABASE_URL}{path}',
        data=json.dumps(body).encode() if body else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        body_err = e.read().decode('utf-8', errors='replace')[:200]
        raise Exception(f'HTTP {e.code}: {body_err}')


# 200+ US metros (lat, lng, city-name)
US_METROS = [
    # Top 100 by pop + coverage gaps
    (40.71, -74.01, 'New York'), (34.05, -118.24, 'Los Angeles'), (41.88, -87.62, 'Chicago'),
    (29.76, -95.36, 'Houston'), (33.45, -112.07, 'Phoenix'), (39.95, -75.17, 'Philadelphia'),
    (29.42, -98.49, 'San Antonio'), (32.71, -117.16, 'San Diego'), (32.78, -96.80, 'Dallas'),
    (37.34, -121.89, 'San Jose'), (30.27, -97.74, 'Austin'), (30.33, -81.66, 'Jacksonville'),
    (32.75, -97.33, 'Fort Worth'), (39.96, -82.99, 'Columbus'), (35.23, -80.84, 'Charlotte'),
    (39.74, -104.99, 'Denver'), (37.77, -122.42, 'San Francisco'), (35.15, -90.05, 'Memphis'),
    (37.80, -122.27, 'Oakland'), (42.33, -83.05, 'Detroit'), (32.78, -79.93, 'Charleston'),
    (36.16, -86.78, 'Nashville'), (35.47, -97.52, 'Oklahoma City'), (35.08, -106.65, 'Albuquerque'),
    (38.62, -90.20, 'St Louis'), (39.10, -84.51, 'Cincinnati'), (40.44, -79.99, 'Pittsburgh'),
    (44.98, -93.27, 'Minneapolis'), (44.95, -93.09, 'St Paul'), (36.17, -115.14, 'Las Vegas'),
    (39.77, -86.16, 'Indianapolis'), (33.75, -84.39, 'Atlanta'), (39.29, -76.61, 'Baltimore'),
    (38.90, -77.04, 'DC'), (42.36, -71.06, 'Boston'), (47.61, -122.33, 'Seattle'),
    (45.52, -122.68, 'Portland OR'), (25.76, -80.19, 'Miami'), (26.12, -80.14, 'Ft Lauderdale'),
    (28.54, -81.38, 'Orlando'), (27.95, -82.46, 'Tampa'), (26.64, -81.87, 'Ft Myers'),
    (33.52, -86.80, 'Birmingham'), (35.78, -78.64, 'Raleigh'), (36.08, -79.79, 'Greensboro'),
    (35.91, -79.04, 'Chapel Hill'), (41.50, -81.69, 'Cleveland'), (41.08, -81.52, 'Akron'),
    (41.65, -83.54, 'Toledo'), (42.97, -85.67, 'Grand Rapids'), (42.73, -84.55, 'Lansing'),
    (42.28, -83.74, 'Ann Arbor'), (43.65, -70.25, 'Portland ME'), (43.08, -77.67, 'Rochester NY'),
    (43.16, -77.61, 'Rochester NY 2'), (42.89, -78.88, 'Buffalo'), (43.05, -76.15, 'Syracuse'),
    (42.65, -73.76, 'Albany'), (42.10, -75.92, 'Binghamton'), (42.35, -87.82, 'Waukegan IL'),
    (41.76, -72.67, 'Hartford'), (41.30, -72.93, 'New Haven'), (40.74, -74.18, 'Newark'),
    (40.65, -73.95, 'Brooklyn'), (40.73, -73.87, 'Queens'), (40.85, -73.94, 'Bronx'),
    (30.45, -91.14, 'Baton Rouge'), (29.95, -90.07, 'New Orleans'), (32.52, -93.74, 'Shreveport'),
    (41.59, -93.62, 'Des Moines'), (41.66, -91.53, 'Iowa City'), (41.26, -95.93, 'Omaha'),
    (40.81, -96.67, 'Lincoln'), (37.69, -97.34, 'Wichita'), (38.03, -84.50, 'Lexington'),
    (38.25, -85.76, 'Louisville'), (39.09, -94.57, 'Kansas City'), (39.70, -86.31, 'Plainfield IN'),
    (38.83, -104.82, 'Colorado Springs'), (40.59, -105.09, 'Ft Collins'), (40.02, -105.27, 'Boulder'),
    (41.14, -104.82, 'Cheyenne'), (43.62, -116.20, 'Boise'), (40.76, -111.89, 'Salt Lake City'),
    (32.22, -110.93, 'Tucson'), (33.42, -111.93, 'Tempe AZ'), (33.68, -117.83, 'Irvine CA'),
    (34.01, -118.49, 'Santa Monica'), (34.15, -118.14, 'Pasadena'), (33.64, -117.92, 'Santa Ana'),
    (33.81, -117.92, 'Anaheim'), (38.58, -121.49, 'Sacramento'), (37.77, -121.28, 'Stockton'),
    (36.75, -119.77, 'Fresno'), (35.37, -119.02, 'Bakersfield'), (36.68, -121.80, 'Salinas'),
    (47.66, -117.43, 'Spokane'), (46.60, -120.51, 'Yakima WA'), (46.58, -112.04, 'Helena'),
    (45.69, -111.03, 'Bozeman'), (44.77, -106.96, 'Sheridan WY'), (43.61, -116.20, 'Boise 2'),
    (46.87, -96.79, 'Fargo'), (47.92, -97.03, 'Grand Forks'), (43.54, -96.72, 'Sioux Falls'),
    (44.30, -96.71, 'Brookings SD'), (43.63, -95.60, 'Rural MN'), (44.95, -89.63, 'Wausau WI'),
    (43.04, -87.91, 'Milwaukee'), (43.07, -89.40, 'Madison'), (44.52, -88.02, 'Green Bay'),
    (44.95, -94.43, 'Willmar MN'), (46.80, -92.10, 'Duluth'), (46.28, -96.07, 'Wahpeton ND'),
    # Texas expansion
    (31.76, -106.49, 'El Paso'), (33.01, -96.70, 'Plano TX'), (32.84, -96.85, 'Richardson TX'),
    (32.90, -97.04, 'Grapevine TX'), (32.73, -97.11, 'Arlington TX'), (29.53, -95.28, 'League City'),
    (27.80, -97.40, 'Corpus Christi'), (26.20, -98.23, 'McAllen'),
    # SE
    (27.77, -82.67, 'St Petersburg'), (28.39, -81.50, 'Kissimmee'), (28.81, -81.27, 'Altamonte'),
    (26.14, -80.14, 'Ft Laud 2'), (26.15, -81.80, 'Naples FL'), (30.16, -85.66, 'Panama City'),
    (32.08, -81.09, 'Savannah'), (33.97, -83.40, 'Athens GA'), (34.00, -81.03, 'Columbia SC'),
    (32.84, -80.00, 'Charleston SC 2'), (34.10, -84.52, 'Roswell GA'), (35.05, -85.31, 'Chattanooga'),
    (35.96, -83.92, 'Knoxville'), (36.53, -82.56, 'Bristol TN'), (37.27, -79.94, 'Roanoke'),
    (37.55, -77.44, 'Richmond'), (36.85, -76.29, 'Norfolk'), (39.28, -76.61, 'Baltimore 2'),
    (38.80, -77.19, 'Fairfax VA'), (39.09, -77.15, 'Bethesda'), (39.78, -74.18, 'Long Branch NJ'),
    (40.00, -105.27, 'Boulder 2'), (39.52, -119.81, 'Reno NV'), (35.69, -105.94, 'Santa Fe'),
    (34.54, -112.47, 'Prescott AZ'), (36.06, -95.85, 'Broken Arrow OK'), (35.22, -97.44, 'Norman OK'),
    (36.15, -95.99, 'Tulsa'), (34.74, -92.33, 'Little Rock'), (35.36, -94.37, 'Fort Smith AR'),
    # PNW/Great Plains gaps
    (47.67, -117.41, 'Spokane Valley'), (46.24, -119.10, 'Pasco WA'), (46.59, -120.55, 'Yakima'),
    (45.48, -122.80, 'Beaverton OR'), (44.05, -123.09, 'Eugene'), (43.23, -123.36, 'Roseburg'),
    (45.53, -122.98, 'Hillsboro OR'), (47.25, -122.44, 'Tacoma'), (47.98, -122.20, 'Everett'),
    (48.75, -122.48, 'Bellingham'), (45.62, -122.68, 'Vancouver WA'),
    # New England
    (43.21, -71.54, 'Concord NH'), (42.99, -71.46, 'Manchester NH'), (44.48, -73.21, 'Burlington VT'),
    (41.82, -71.41, 'Providence'), (42.10, -72.59, 'Springfield MA'), (42.27, -71.79, 'Worcester MA'),
    (42.24, -70.86, 'Braintree MA'),
    # Other coastal
    (28.06, -82.41, 'Temple Terrace'), (27.44, -80.33, 'Port St Lucie'), (27.64, -80.40, 'Vero Beach'),
    (29.19, -82.14, 'Ocala'), (25.85, -80.21, 'North Miami'), (26.01, -80.15, 'Hollywood FL'),
    (33.83, -84.35, 'Atlanta 2'), (34.22, -84.26, 'Canton GA'), (33.50, -82.07, 'Augusta GA'),
    (29.62, -82.33, 'Gainesville FL'), (28.66, -81.21, 'Oviedo FL'), (30.45, -84.28, 'Tallahassee'),
    # Midwest fill
    (41.88, -88.10, 'Glen Ellyn IL'), (42.12, -87.95, 'Wheeling IL'), (41.90, -87.69, 'Chicago W'),
    (41.78, -87.58, 'Chicago S'), (41.85, -88.31, 'Aurora IL'), (42.44, -87.82, 'Kenosha'),
    (42.58, -87.82, 'Racine WI'), (43.53, -87.98, 'Sheboygan'), (44.24, -87.41, 'Two Rivers'),
    (44.81, -87.38, 'Sturgeon Bay'), (39.16, -86.53, 'Bloomington IN'), (40.73, -74.87, 'Whitehouse NJ'),
    (39.04, -77.05, 'Rockville'), (38.98, -76.49, 'Annapolis'),
]


def fetch_metro(lat, lng, q):
    """Call MapQuest search, return list of business dicts."""
    params = urllib.parse.urlencode({
        'key': MAPQUEST_KEY,
        'location': f'{lng},{lat}',  # lng,lat order
        'q': q,
        'limit': 50,
        'sort': 'distance',
    })
    url = f'https://www.mapquestapi.com/search/v4/place?{params}'
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0','Accept':'application/json'})
        with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as r:
            return json.loads(r.read()).get('results', [])
    except Exception as e:
        return []


def extract_business(r):
    """Extract clean dict from MapQuest result."""
    p = r.get('place', {}).get('properties', {}) or {}
    geo = r.get('place', {}).get('geometry', {}).get('coordinates', [None, None])
    return {
        'mq_id': r.get('id'),
        'name': r.get('name'),
        'street': p.get('street'),
        'city': p.get('city'),
        'state': p.get('stateCode'),
        'zip': p.get('postalCode'),
        'country': p.get('countryCode'),
        'lng': geo[0] if geo else None,
        'lat': geo[1] if len(geo) > 1 else None,
        'slug': r.get('slug'),
    }


TOUCHLESS_NAME_RE = re.compile(r'touch[\s-]?(less|free)|brushless|laser[\s-]?wash|no[\s-]?touch|no[\s-]?brush', re.I)


def slugify(s): return re.sub(r'[^a-z0-9]+','-',(s or '').lower()).strip('-')


def main():
    log('=' * 60)
    log(f'MAPQUEST DISCOVERY — dry={DRY_RUN} insert={INSERT}')
    log(f'Metros: {len(US_METROS)}')
    log('=' * 60)

    QUERIES = ['touchless car wash', 'touch free car wash', 'laser car wash', 'brushless car wash']
    all_results = {}  # keyed by (name, city, state) for dedup
    stats = {'queries': 0, 'results': 0, 'unique': 0}

    def fetch_one(args):
        lat, lng, metro = args
        locally = []
        for q in QUERIES:
            results = fetch_metro(lat, lng, q)
            stats['queries'] += 1
            for r in results:
                b = extract_business(r)
                if not b.get('name') or not TOUCHLESS_NAME_RE.search(b['name']): continue
                key = f"{slugify(b['name'])}|{slugify(b.get('city'))}|{b.get('state') or ''}"
                locally.append((key, b))
            time.sleep(0.2)
        return metro, locally

    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = {ex.submit(fetch_one, m): m for m in US_METROS}
        for fut in as_completed(futures):
            metro, locally = fut.result()
            new_keys = 0
            for key, b in locally:
                if key not in all_results:
                    all_results[key] = b
                    new_keys += 1
            if new_keys > 0:
                log(f'  {metro}: {len(locally)} matches, {new_keys} new (total unique: {len(all_results)})')

    stats['results'] = sum(1 for _ in all_results)
    log(f'\nTotal unique touchless-named businesses: {len(all_results)}')
    log(f'API calls: {stats["queries"]}')

    # Save raw
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w') as f:
        json.dump(list(all_results.values()), f, indent=2)
    log(f'Saved to {OUT_FILE}')

    if not INSERT:
        log('\n(Not inserting — add --insert to apply.)')
        log('Samples:')
        for b in list(all_results.values())[:15]:
            log(f'  {b["name"]} | {b["street"]}, {b["city"]}, {b["state"]}')
        return

    # Dedup against DB by coords
    existing_data = []
    offset = 0
    while True:
        rows = sb_req('GET', f'/rest/v1/listings?select=id,name,latitude,longitude&limit=2000&offset={offset}')
        if not rows: break
        existing_data.extend(rows)
        if len(rows) < 2000: break
        offset += 2000
    log(f'Existing DB: {len(existing_data)}')

    def close_match(b):
        lat = b.get('lat'); lng = b.get('lng')
        if not lat: return False
        for e in existing_data:
            if e.get('latitude') is None: continue
            if abs(float(e['latitude']) - lat) < 0.0015 and abs(float(e['longitude']) - lng) < 0.0015:
                return True
        return False

    to_insert = [b for b in all_results.values() if not close_match(b)]
    log(f'\nMissing from DB: {len(to_insert)}')

    today = datetime.date.today().isoformat()
    ok = 0; err = 0
    for b in to_insert:
        slug = f'{slugify(b["name"])}-{slugify(b.get("street"))}-{slugify(b.get("city"))}-{(b.get("state") or "").lower()}-{b.get("zip") or ""}'.strip('-')[:200]
        body = [{
            'name': b['name'],
            'address': b.get('street'),
            'city': b.get('city'),
            'state': b.get('state'),
            'zip': b.get('zip') or '00000',
            'latitude': b.get('lat'),
            'longitude': b.get('lng'),
            'website': None,
            'parent_chain': None,
            'is_touchless': True,
            'is_approved': False,
            'touchless_verified': 'name',
            'slug': slug,
            'crawl_notes': f'[{today}] Discovered via MapQuest Place Search API (business name contains touchless/brushless/laser keyword). Held pending hero/enrichment.',
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }]
        try:
            sb_req('POST', '/rest/v1/listings', body=body)
            ok += 1
        except Exception as e:
            err += 1
            err_str = str(e)[:150]
            if 'duplicate' not in err_str.lower():
                log(f'  ❌ {b["name"]}: {err_str}')

    log(f'\nInserted: {ok}  Errors: {err}')


if __name__ == '__main__':
    main()
