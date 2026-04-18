#!/usr/bin/env python3
"""
Reconcile Holiday Station car-wash locations against our DB.
Data source: scripts/discovery-output/circlek-stores.json (grid-scan of
circlek.com/stores_master.php returned 225 Holiday Station stores with car wash).

Actions:
  1. Filter circlek-stores.json for display_brand='Holiday Station' with car_wash service
  2. Match against existing DB Holiday Stationstores listings by coords (within 100m)
  3. Insert missing ones as is_touchless=true, is_approved=false,
     parent_chain='Holiday Stationstores', touchless_verified='chain'
"""
import json, os, re, ssl, urllib.request, datetime, sys

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
SSL_CTX = ssl.create_default_context(); SSL_CTX.check_hostname=False; SSL_CTX.verify_mode=ssl.CERT_NONE

DRY_RUN = '--dry-run' in sys.argv


def log(m): print(f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {m}', flush=True)


def sb_req(method, path, body=None):
    headers = {'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}', 'Content-Type':'application/json'}
    if method in ('POST','PATCH'): headers['Prefer'] = 'return=representation'
    req = urllib.request.Request(f'{SUPABASE_URL}{path}',
        data=json.dumps(body).encode() if body else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
            raw = r.read()
            if not raw: return None
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')[:300]
        raise Exception(f'HTTP {e.code}: {body}')


def slugify(s): return re.sub(r'[^a-z0-9]+','-',(s or '').lower()).strip('-')


# Rough state lookup by lat/lng bounding box (good enough for Holiday — concentrated in MN/WI/IA/ND/SD/MI)
STATE_BOXES = [
    # (name, min_lat, max_lat, min_lng, max_lng)
    ('MN', 43.50, 49.40, -97.25, -89.48),
    ('WI', 42.50, 47.10, -92.90, -86.75),
    ('IA', 40.38, 43.50, -96.65, -90.14),
    ('ND', 45.94, 49.00, -104.05, -96.55),
    ('SD', 42.48, 45.95, -104.06, -96.44),
    ('MI', 41.70, 48.30, -90.42, -82.12),
    ('IL', 36.97, 42.51, -91.51, -87.02),
    ('OH', 38.40, 42.33, -84.82, -80.52),
    ('IN', 37.77, 41.77, -88.10, -84.78),
    ('MO', 35.99, 40.62, -95.77, -89.10),
    ('KS', 36.99, 40.01, -102.05, -94.59),
    ('NE', 39.99, 43.00, -104.05, -95.31),
    ('CO', 36.99, 41.00, -109.06, -102.04),
    ('WY', 40.99, 45.00, -111.06, -104.05),
    ('MT', 44.99, 49.00, -116.05, -104.04),
    ('AZ', 31.33, 37.00, -114.82, -109.04),
    ('CA', 32.53, 42.01, -124.41, -114.13),
    ('NY', 40.49, 45.02, -79.76, -71.85),
    ('PA', 39.72, 42.27, -80.52, -74.69),
    ('FL', 24.52, 31.00, -87.63, -80.03),
    ('GA', 30.36, 35.00, -85.61, -80.84),
    ('SC', 32.03, 35.22, -83.35, -78.54),
    ('NC', 33.85, 36.59, -84.32, -75.46),
    ('TX', 25.84, 36.50, -106.65, -93.51),
    ('LA', 28.93, 33.02, -94.04, -88.82),
    ('TN', 34.98, 36.68, -90.31, -81.65),
    ('KY', 36.50, 39.15, -89.57, -81.97),
    ('VA', 36.54, 39.47, -83.68, -75.24),
    ('WA', 45.54, 49.00, -124.85, -116.92),
    ('OR', 41.99, 46.29, -124.70, -116.46),
    ('ID', 41.99, 49.00, -117.24, -111.04),
    ('NV', 35.00, 42.00, -120.00, -114.04),
    ('NM', 31.33, 37.00, -109.05, -103.00),
    ('UT', 37.00, 42.00, -114.05, -109.04),
    ('OK', 33.62, 37.00, -103.00, -94.43),
    ('AR', 33.00, 36.50, -94.62, -89.64),
    ('MS', 30.17, 35.00, -91.65, -88.10),
    ('AL', 30.20, 35.01, -88.47, -84.89),
]


def state_from_coords(lat, lng):
    if not lat or not lng: return None
    for name, lat_lo, lat_hi, lng_lo, lng_hi in STATE_BOXES:
        if lat_lo <= lat <= lat_hi and lng_lo <= lng <= lng_hi:
            return name
    return None


def main():
    # Load scanned data
    path = os.path.join(os.path.dirname(__file__), 'discovery-output', 'circlek-stores.json')
    with open(path) as f: data = json.load(f)
    log(f'Loaded {len(data)} total stores from Circle K scan')

    # Filter Holiday Station + has car_wash
    holiday_cw = []
    for sid, s in data.items():
        if s.get('display_brand') != 'Holiday Station': continue
        services = s.get('services') or []
        has_cw = any((sv.get('name') if isinstance(sv, dict) else str(sv)).lower() == 'car_wash' for sv in services)
        if has_cw: holiday_cw.append(s)
    log(f'Holiday Station stores with car wash: {len(holiday_cw)}')

    # Fetch existing Holiday DB listings
    existing = []
    offset = 0
    while True:
        rows = sb_req('GET', f'/rest/v1/listings?select=id,name,address,city,state,latitude,longitude&parent_chain=eq.Holiday%20Stationstores&limit=500&offset={offset}')
        if not rows: break
        existing.extend(rows)
        if len(rows) < 500: break
        offset += 500
    log(f'Existing Holiday Stationstores in DB: {len(existing)}')

    # Match by coords (within 100m = 0.0015 deg)
    def find_match(store):
        lat = float(store.get('latitude', 0))
        lng = float(store.get('longitude', 0))
        if not lat or not lng: return None
        for e in existing:
            if e.get('latitude') is None: continue
            if abs(float(e['latitude']) - lat) < 0.0015 and abs(float(e['longitude']) - lng) < 0.0015:
                return e
        return None

    to_insert = []
    for s in holiday_cw:
        if not find_match(s):
            to_insert.append(s)
    log(f'Missing from DB: {len(to_insert)}')

    if DRY_RUN:
        log('\n--- Sample (dry run) ---')
        for s in to_insert[:15]:
            log(f'  {s["city"]}, {s["address"]}')
        return

    today = datetime.date.today().isoformat()
    ok = 0; err = 0
    for s in to_insert:
        url_path = s.get('url') or ''
        lat = float(s.get('latitude', 0)) or None
        lng = float(s.get('longitude', 0)) or None
        state = state_from_coords(lat, lng)
        if not state:
            err += 1
            log(f'  ⚠ no state for {s.get("city")} (lat={lat}, lng={lng})')
            continue
        addr_full = f"{s.get('address','')}, {s.get('city','').title()}, {state}"
        slug = f'holiday-stationstores-{slugify(s.get("city"))}-{slugify(s.get("address"))}-{state.lower()}-{s.get("cost_center","")}'[:200]
        body = [{
            'name': f'Holiday Stationstores',
            'address': s.get('address'),
            'city': (s.get('city') or '').title(),
            'state': state,
            'zip': '00000',  # placeholder, enrichment can fill later
            'phone': None,
            'latitude': lat,
            'longitude': lng,
            'website': f'https://www.circlek.com{url_path}' if url_path else 'https://www.circlek.com/us/holiday-station',
            'parent_chain': 'Holiday Stationstores',
            'is_touchless': True,
            'is_approved': False,  # held pending hero/verification
            'touchless_verified': 'chain',
            'slug': slug,
            'crawl_notes': f'[{today}] Discovered via Circle K stores_master.php API (cost_center={s.get("cost_center")}). Holiday Station branded + car_wash service. Held pending hero/enrichment.',
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }]
        try:
            sb_req('POST', '/rest/v1/listings', body=body)
            ok += 1
        except Exception as e:
            err += 1
            err_str = str(e)[:150]
            if 'duplicate' not in err_str.lower():
                log(f'  ❌ insert failed for {s.get("city")}: {err_str}')

    log(f'\nInserted: {ok}  Errors (mostly dupes): {err}')


if __name__ == '__main__':
    main()
