#!/usr/bin/env python3
"""
Discover car washes from OpenStreetMap that we're missing.

Queries the Overpass API for all car washes in each US state,
then coordinate-matches against our DB to find gaps.
Car washes with touchless signals in their name get auto-promoted.

Completely free — uses public Overpass API.

Run: python3 scripts/osm-carwash-discovery.py [--state OH] [--all]
"""
import json, math, re, ssl, urllib.request, urllib.parse, time, datetime, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from junk_filter import is_junk_listing

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'osm-carwash-discovery.log')

# State bounding boxes (lat_min, lon_min, lat_max, lon_max)
STATE_BOXES = {
    'AL': (30.22, -88.47, 35.01, -84.89), 'AK': (51.21, -179.15, 71.39, -129.98),
    'AZ': (31.33, -114.81, 37.00, -109.04), 'AR': (33.00, -94.62, 36.50, -89.64),
    'CA': (32.53, -124.48, 42.01, -114.13), 'CO': (36.99, -109.06, 41.00, -102.04),
    'CT': (40.95, -73.73, 42.05, -71.79), 'DE': (38.45, -75.79, 39.84, -75.05),
    'FL': (24.40, -87.63, 31.00, -80.03), 'GA': (30.36, -85.61, 35.00, -80.84),
    'HI': (18.91, -160.24, 22.24, -154.81), 'ID': (41.99, -117.24, 49.00, -111.04),
    'IL': (36.97, -91.51, 42.51, -87.02), 'IN': (37.77, -88.10, 41.76, -84.78),
    'IA': (40.37, -96.64, 43.50, -90.14), 'KS': (36.99, -102.05, 40.00, -94.59),
    'KY': (36.50, -89.57, 39.15, -81.96), 'LA': (28.93, -94.04, 33.02, -89.00),
    'ME': (42.98, -71.08, 47.46, -66.95), 'MD': (37.91, -79.49, 39.72, -75.05),
    'MA': (41.24, -73.51, 42.89, -69.93), 'MI': (41.70, -90.42, 48.26, -82.12),
    'MN': (43.50, -97.24, 49.38, -89.49), 'MS': (30.17, -91.66, 34.99, -88.10),
    'MO': (35.99, -95.77, 40.61, -89.10), 'MT': (44.36, -116.05, 49.00, -104.04),
    'NE': (39.99, -104.05, 43.00, -95.31), 'NV': (35.00, -120.01, 42.00, -114.04),
    'NH': (42.70, -72.56, 45.31, -70.70), 'NJ': (38.93, -75.56, 41.36, -73.89),
    'NM': (31.33, -109.05, 37.00, -103.00), 'NY': (40.50, -79.76, 45.01, -71.86),
    'NC': (33.84, -84.32, 36.59, -75.46), 'ND': (45.94, -104.05, 49.00, -96.55),
    'OH': (38.40, -84.82, 41.98, -80.52), 'OK': (33.62, -103.00, 37.00, -94.43),
    'OR': (41.99, -124.57, 46.29, -116.46), 'PA': (39.72, -80.52, 42.27, -74.69),
    'RI': (41.15, -71.86, 42.02, -71.12), 'SC': (32.05, -83.35, 35.22, -78.54),
    'SD': (42.48, -104.06, 45.94, -96.44), 'TN': (34.98, -90.31, 36.68, -81.65),
    'TX': (25.84, -106.65, 36.50, -93.51), 'UT': (36.99, -114.05, 42.00, -109.04),
    'VT': (42.73, -73.44, 45.02, -71.46), 'VA': (36.54, -83.68, 39.47, -75.24),
    'WA': (45.54, -124.85, 49.00, -116.92), 'WV': (37.20, -82.64, 40.64, -77.72),
    'WI': (42.49, -92.89, 47.08, -86.25), 'WY': (40.99, -111.06, 45.01, -104.05),
    'DC': (38.79, -77.12, 38.99, -76.91),
}

TOUCHLESS_PATTERNS = re.compile(
    r'touch[\s-]?less|touch[\s-]?free|no[\s-]?touch|laser\s*wash|laserwash|brush[\s-]?less|brush[\s-]?free',
    re.IGNORECASE
)

OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
]


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


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000; p = math.pi / 180
    a = 0.5 - math.cos((lat2 - lat1) * p) / 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2
    return 2 * R * math.asin(math.sqrt(a))


def slugify(t):
    return re.sub(r'-+', '-', re.sub(r'\s+', '-', re.sub(r'[^a-z0-9\s-]', '', t.lower()))).strip('-')


def query_overpass(bbox, retries=3):
    """Query Overpass API for car washes in a bounding box with retries."""
    lat_min, lon_min, lat_max, lon_max = bbox
    query = f'[out:json][timeout:60];(node["amenity"="car_wash"]({lat_min},{lon_min},{lat_max},{lon_max});way["amenity"="car_wash"]({lat_min},{lon_min},{lat_max},{lon_max}););out tags center;'

    for attempt in range(retries):
        for endpoint in OVERPASS_ENDPOINTS:
            try:
                data = urllib.parse.urlencode({'data': query}).encode()
                req = urllib.request.Request(endpoint, data=data)
                with urllib.request.urlopen(req, timeout=90, context=ssl_ctx) as r:
                    result = json.loads(r.read())
                return result.get('elements', [])
            except Exception as e:
                log(f'    Endpoint {endpoint.split("//")[1].split("/")[0]} failed: {e}')
                time.sleep(3)
                continue
        if attempt < retries - 1:
            wait = 15 * (attempt + 1)
            log(f'    All endpoints failed, retry {attempt+2}/{retries} in {wait}s...')
            time.sleep(wait)
    return []


def main():
    # Parse args
    target_state = None
    target_states = None
    run_all = '--all' in sys.argv
    for i, arg in enumerate(sys.argv):
        if arg == '--state' and i + 1 < len(sys.argv):
            target_state = sys.argv[i + 1].upper()
        if arg == '--states' and i + 1 < len(sys.argv):
            target_states = [s.strip().upper() for s in sys.argv[i + 1].split(',')]

    states = target_states if target_states else ([target_state] if target_state else (list(STATE_BOXES.keys()) if run_all else ['DE', 'VT', 'RI', 'NH', 'CT']))

    log('=' * 60)
    log(f'OpenStreetMap Car Wash Discovery — {len(states)} states')
    log('=' * 60)

    # Load existing slugs
    existing_slugs = set()
    offset = 0
    while True:
        rows = sb_req('GET', f'/rest/v1/listings?select=slug&limit=1000&offset={offset}')
        if not rows: break
        for r in rows: existing_slugs.add(r.get('slug', ''))
        if len(rows) < 1000: break
        offset += 1000

    def make_slug(name):
        base = slugify(name or 'car-wash')
        c, a = base, 0
        while c in existing_slugs: a += 1; c = f'{base}-{a}'
        existing_slugs.add(c)
        return c

    # Load our listing coordinates for matching
    log('Loading our listing coordinates...')
    our_coords = []
    offset = 0
    while True:
        rows = sb_req('GET', f'/rest/v1/listings?select=latitude,longitude&latitude=not.is.null&longitude=not.is.null&limit=1000&offset={offset}')
        if not rows: break
        for r in rows:
            our_coords.append((float(r['latitude']), float(r['longitude'])))
        if len(rows) < 1000: break
        offset += 1000
    log(f'Loaded {len(our_coords)} listing coordinates')

    total_osm = 0
    total_matched = 0
    total_missing = 0
    total_touchless = 0
    total_created = 0

    for state in states:
        bbox = STATE_BOXES.get(state)
        if not bbox:
            log(f'  {state}: no bounding box')
            continue

        log(f'\n  Querying OSM for {state}...')
        elements = query_overpass(bbox)
        if not elements:
            log(f'  {state}: no results or API error')
            time.sleep(5)
            continue

        osm_washes = []
        for el in elements:
            tags = el.get('tags', {})
            lat = el.get('lat') or (el.get('center', {}) or {}).get('lat')
            lon = el.get('lon') or (el.get('center', {}) or {}).get('lon')
            if not lat or not lon: continue
            name = tags.get('name', '')
            osm_washes.append({
                'name': name, 'lat': float(lat), 'lon': float(lon),
                'addr': f'{tags.get("addr:housenumber", "")} {tags.get("addr:street", "")}'.strip(),
                'city': tags.get('addr:city', ''),
                'phone': tags.get('phone'),
                'website': tags.get('website'),
                'hours': tags.get('opening_hours'),
                'brand': tags.get('brand', ''),
                'touchless': bool(TOUCHLESS_PATTERNS.search(name + ' ' + tags.get('car_wash', ''))),
            })

        # Match against our DB by coordinates
        matched = 0
        missing = []
        for osm in osm_washes:
            found = False
            for our_lat, our_lon in our_coords:
                if haversine(osm['lat'], osm['lon'], our_lat, our_lon) < 150:
                    found = True
                    matched += 1
                    break
            if not found and osm['name']:  # Only import named locations
                missing.append(osm)

        touchless_missing = [m for m in missing if m['touchless']]

        total_osm += len(osm_washes)
        total_matched += matched
        total_missing += len(missing)
        total_touchless += len(touchless_missing)

        log(f'  {state}: {len(osm_washes)} OSM → {matched} matched, {len(missing)} missing ({len(touchless_missing)} touchless)')

        # Create missing locations
        skipped_junk = 0
        for loc in missing:
            # Junk filter — skip hotels, pharmacies, laundromats, pet-only, etc.
            is_junk, reason = is_junk_listing(loc['name'], loc.get('website'))
            if is_junk:
                skipped_junk += 1
                continue
            slug = make_slug(loc['name'])
            listing = {
                'name': loc['name'], 'slug': slug,
                'address': loc['addr'] or '', 'city': loc['city'] or '',
                'state': state, 'zip': '',
                'latitude': loc['lat'], 'longitude': loc['lon'],
                'phone': loc['phone'], 'website': loc['website'],
                'is_touchless': True if loc['touchless'] else None,
                'touchless_verified': 'name' if loc['touchless'] else None,
                'is_approved': True, 'is_featured': False,
                'hours': {}, 'wash_packages': [], 'amenities': [], 'photos': [],
                'crawl_status': 'pending',
                'crawl_notes': f'Discovered via OpenStreetMap. {"Touchless signal in name." if loc["touchless"] else "Needs touchless verification."}',
            }
            try:
                sb_req('POST', '/rest/v1/listings', listing)
                total_created += 1
                # Add to our coords so we don't double-import
                our_coords.append((loc['lat'], loc['lon']))
            except:
                pass

        if skipped_junk:
            log(f'    (skipped {skipped_junk} junk listings via junk_filter)')

        # Be polite to Overpass API — 10s between states to avoid rate limiting
        time.sleep(10)

    log('')
    log('=' * 60)
    log('OSM DISCOVERY COMPLETE')
    log(f'  States queried: {len(states)}')
    log(f'  OSM car washes found: {total_osm}')
    log(f'  Matched to our DB: {total_matched}')
    log(f'  Missing (named): {total_missing}')
    log(f'  With touchless signal: {total_touchless}')
    log(f'  Created: {total_created}')
    log('=' * 60)


if __name__ == '__main__':
    main()
