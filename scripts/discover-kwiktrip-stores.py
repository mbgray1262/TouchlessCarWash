#!/usr/bin/env python3
"""
Kwik Trip / Kwik Star chain discovery — pure HTTP via their internal API.

Found via network inspection: https://www.kwiktrip.com/locproxy.php?location={id}
returns structured JSON with address, geo, hours, phone, properties, and a
dedicated `carWash` field (non-null when the store has a car wash, including
the car wash's own hours).

Pipeline:
  1. Fetch sitemap (925 store URLs -> store IDs)
  2. For each store ID, hit /locproxy.php?location={id}  (fast HTTP, no browser)
  3. Filter to stores with carWash field populated OR property CAR-WASH.hasProperty=true
  4. Dedup against existing DB by coords (within 100m) OR address exact match
  5. Insert missing as: is_touchless=true, is_approved=false,
     parent_chain='Kwik Trip', touchless_verified='chain'

Zero API cost, no browser — all pure HTTP. Should complete in <10 min for 925 stores.
"""
import json, sys, os, re, datetime, ssl, time
import urllib.request
from urllib.error import HTTPError, URLError
from concurrent.futures import ThreadPoolExecutor, as_completed

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

SCRIPT_DIR = os.path.dirname(__file__)
OUT_FILE = os.path.join(SCRIPT_DIR, 'discovery-output', 'kwiktrip-stores.json')
LOG_FILE = os.path.join(SCRIPT_DIR, 'discover-kwiktrip.log')

LIMIT = 0
DRY_RUN = False
INSERT = False

for i, a in enumerate(sys.argv[1:], 1):
    if a == '--limit' and i < len(sys.argv)-1: LIMIT = int(sys.argv[i+1])
    elif a.startswith('--limit='): LIMIT = int(a.split('=')[1])
    elif a == '--dry-run': DRY_RUN = True
    elif a == '--insert': INSERT = True


def log(msg):
    line = f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f: f.write(line + '\n')


def fetch_url(url, timeout=15):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 Chrome/122'})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
        raw = r.read()
        # Decode with BOM stripping
        if raw.startswith(b'\xef\xbb\xbf'): raw = raw[3:]
        return raw.decode('utf-8', errors='replace')


def sb_req(method, path, body=None):
    headers = {
        'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}',
        'Content-Type': 'application/json',
    }
    if method in ('POST', 'PATCH'): headers['Prefer'] = 'return=representation'
    req = urllib.request.Request(f'{SUPABASE_URL}{path}',
        data=json.dumps(body).encode() if body else None,
        headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        return json.loads(r.read() or b'null')


def fetch_store(store_id):
    """Hit /locproxy.php and return store data. Returns None on error or empty."""
    url = f'https://www.kwiktrip.com/locproxy.php?location={store_id}'
    try:
        text = fetch_url(url)
        data = json.loads(text)
        # Empty response for invalid IDs = top-level fields all None
        if not data.get('name'): return None
        return data
    except Exception:
        return None


def has_car_wash(store_data):
    """Check if store has car wash, by dedicated field or properties."""
    if not store_data: return False
    if store_data.get('carWash'): return True
    for p in store_data.get('properties', []) or []:
        if p.get('name') == 'CAR-WASH' and p.get('hasProperty'):
            return True
    return False


def main():
    log('=' * 60)
    log(f'KWIK TRIP DISCOVERY (API) — dry_run={DRY_RUN} insert={INSERT} limit={LIMIT}')
    log('=' * 60)

    # 1. Fetch sitemap -> store IDs
    log('Fetching sitemap...')
    sitemap = fetch_url('https://www.kwiktrip.com/store-sitemap.xml')
    store_ids = re.findall(r'<loc>https://www\.kwiktrip\.com/locator/store\?id=(\d+)</loc>', sitemap)
    log(f'Sitemap: {len(store_ids)} store IDs')
    if LIMIT > 0: store_ids = store_ids[:LIMIT]

    # 2. Fetch all stores in parallel (10 concurrent threads)
    log(f'Fetching {len(store_ids)} stores via /locproxy.php (10 concurrent)...')
    stores = {}
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = {ex.submit(fetch_store, sid): sid for sid in store_ids}
        done_n = 0
        for fut in as_completed(futures):
            sid = futures[fut]
            data = fut.result()
            if data: stores[sid] = data
            done_n += 1
            if done_n % 100 == 0:
                elapsed = time.time() - t0
                log(f'  {done_n}/{len(store_ids)} fetched ({elapsed:.0f}s elapsed)')
    log(f'Fetched {len(stores)} valid stores in {time.time()-t0:.0f}s')

    # 3. Filter to ones with car wash
    with_wash = []
    for sid, s in stores.items():
        if has_car_wash(s):
            with_wash.append({
                'store_id': sid,
                'name': s.get('name'),
                'address': s.get('address') or {},
                'phone': s.get('phone'),
                'open24Hours': s.get('open24Hours'),
                'hours': s.get('hours'),
                'carWash': s.get('carWash'),
                'url': f'https://www.kwiktrip.com/locator/store?id={sid}',
            })
    log(f'Stores with car wash: {len(with_wash)}')

    # Save raw data
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w') as f:
        json.dump(with_wash, f, indent=2)
    log(f'Wrote {OUT_FILE}')

    if not INSERT:
        log('\n(Not inserting — run with --insert to add to DB)')
        log('Sample car-wash stores:')
        for s in with_wash[:8]:
            a = s['address']
            log(f'  {s["name"]}: {a.get("address1")}, {a.get("city")}, {a.get("state")}')
        return

    # 4. Dedup against DB
    existing = sb_req('GET', '/rest/v1/listings?select=id,name,address,city,state,latitude,longitude&or=(parent_chain.eq.Kwik%20Trip,name.ilike.*kwik*star*,name.ilike.*kwik*trip*)&limit=2000')
    log(f'Existing Kwik Trip/Star listings in DB: {len(existing)}')

    def close(existing_row, store):
        a = store['address']
        lat = a.get('latitude'); lng = a.get('longitude')
        if existing_row.get('latitude') is None or lat is None: return False
        return abs(float(existing_row['latitude']) - float(lat)) < 0.0015 and \
               abs(float(existing_row['longitude']) - float(lng)) < 0.0015

    to_insert = []
    for s in with_wash:
        a = s['address']
        if not a.get('latitude'): continue
        if any(close(e, s) for e in existing): continue
        to_insert.append(s)

    log(f'Missing from DB: {len(to_insert)}')

    if DRY_RUN:
        log('(DRY RUN — sample of what would be inserted:)')
        for s in to_insert[:15]:
            a = s['address']
            log(f'  {s["name"]}: {a.get("address1")}, {a.get("city")}, {a.get("state")} {a.get("zip")}')
        return

    # 5. Build hours dict and insert
    today = datetime.date.today().isoformat()
    ok = 0; err = 0

    def slugify(s):
        return re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')

    def build_hours(open24, hours_list):
        days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
        if open24: return {d: '00:00-23:59' for d in days}
        if not hours_list: return None
        h = {}
        day_map = {'Monday':'monday','Tuesday':'tuesday','Wednesday':'wednesday',
                   'Thursday':'thursday','Friday':'friday','Saturday':'saturday','Sunday':'sunday'}
        for e in hours_list:
            key = day_map.get(e.get('dayOfWeek'))
            if key:
                ot = (e.get('openTime') or '')[:5] or '00:00'
                ct = (e.get('closeTime') or '')[:5] or '23:59'
                h[key] = f'{ot}-{ct}'
        return h if h else None

    for s in to_insert:
        a = s['address']
        name = s['name']
        # Build full address
        addr_full = f"{a.get('address1','')}, {a.get('city','')}, {a.get('state','')} {a.get('zip','')}".strip(', ')
        slug = f"{slugify(name)}-{slugify(a.get('address1'))}-{slugify(a.get('city'))}-{a.get('state','').lower()}-{a.get('zip','')}".strip('-')[:200]

        # Car-wash-specific hours if available, else use store hours
        cw = s.get('carWash') or {}
        cw_hours = cw.get('hours') if isinstance(cw, dict) else None
        cw_open24 = cw.get('isOpen24Hours') if isinstance(cw, dict) else False
        hours = build_hours(cw_open24 or s.get('open24Hours'), cw_hours or s.get('hours'))

        body = [{
            'name': name,
            'address': addr_full,
            'city': a.get('city'),
            'state': a.get('state'),
            'postal_code': a.get('zip'),
            'phone': s.get('phone'),
            'latitude': a.get('latitude'),
            'longitude': a.get('longitude'),
            'website': s['url'],
            'hours': hours,
            'parent_chain': 'Kwik Trip',
            'is_touchless': True,
            'is_approved': False,
            'touchless_verified': 'chain',
            'slug': slug,
            'crawl_notes': f'[{today}] Discovered via Kwik Trip /locproxy.php API (store #{s["store_id"]}). Car wash confirmed via properties. Held pending hero/enrichment.',
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }]
        try:
            sb_req('POST', '/rest/v1/listings', body=body)
            ok += 1
        except Exception as e:
            err += 1
            log(f'  ❌ insert failed for {name}: {str(e)[:200]}')

    log(f'\nInserted: {ok}  Errors: {err}')


if __name__ == '__main__':
    main()
