#!/usr/bin/env python3
"""
Import BellStores car wash locations as unclassified listings.

BellStores operates both "Touch Free" and "Soft Touch" washes at 42 locations
in OH — their website doesn't specify which type per location, so we import
as is_touchless=null and let review mining classify them.

Source: bellstores.com/home/locations (filtered by Car Wash)
Progress: scripts/import-bellstores-progress.json
Log: scripts/import-bellstores.log
"""
import os, json, re, ssl, urllib.request, urllib.error, time, datetime, subprocess

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

DATAFORSEO_KEY = 'bWljaGFlbEB0b3VjaGxlc3NjYXJ3YXNoZmluZGVyLmNvbTo0ZTQyOWQxMjdhOTExZDdh'
SUPABASE_URL   = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
EDGE_BASE      = f'{SUPABASE_URL}/functions/v1'

SCRIPT_DIR     = os.path.dirname(__file__)
LOG_FILE       = os.path.join(SCRIPT_DIR, 'import-bellstores.log')
PROGRESS_FILE  = os.path.join(SCRIPT_DIR, 'import-bellstores-progress.json')

BELLSTORES_LOCATIONS = [
    {"address": "1261 W. Maple St",              "city": "Hartville",        "state": "OH", "zip": "44632"},
    {"address": "3985 Everhard Rd NW",            "city": "Canton",           "state": "OH", "zip": "44709"},
    {"address": "2424 Akron Rd",                  "city": "Wooster",          "state": "OH", "zip": "44691"},
    {"address": "208 S. Mill St",                 "city": "Dalton",           "state": "OH", "zip": "44618"},
    {"address": "3917 Wales Ave NW",              "city": "Massillon",        "state": "OH", "zip": "44646"},
    {"address": "519 Lincoln Way West",           "city": "Massillon",        "state": "OH", "zip": "44647"},
    {"address": "120 Wabash St",                  "city": "Brewster",         "state": "OH", "zip": "44613"},
    {"address": "108 Lake Ave NE",                "city": "Massillon",        "state": "OH", "zip": "44646"},
    {"address": "4141 Erie St South",             "city": "Massillon",        "state": "OH", "zip": "44646"},
    {"address": "425 W. High St",                 "city": "Orrville",         "state": "OH", "zip": "44667"},
    {"address": "2491 W. State St",               "city": "Alliance",         "state": "OH", "zip": "44601"},
    {"address": "15927 E. Main St",               "city": "Mt. Eaton",        "state": "OH", "zip": "44659"},
    {"address": "1011 Sugarbush Dr",              "city": "Ashland",          "state": "OH", "zip": "44805"},
    {"address": "7467 State Route 250 NW",        "city": "Strasburg",        "state": "OH", "zip": "44680"},
    {"address": "102 E. Nassau St",               "city": "East Canton",      "state": "OH", "zip": "44730"},
    {"address": "132 W. Milltown Rd",             "city": "Wooster",          "state": "OH", "zip": "44691"},
    {"address": "2240 Columbus Rd",               "city": "Wooster",          "state": "OH", "zip": "44691"},
    {"address": "300 W. Sandusky St",             "city": "Fredericktown",    "state": "OH", "zip": "43019"},
    {"address": "7200 Sawmill Rd",                "city": "Columbus",         "state": "OH", "zip": "43235"},
    {"address": "5501 Fisher Rd",                 "city": "Columbus",         "state": "OH", "zip": "43228"},
    {"address": "1923 OH-60",                     "city": "Ashland",          "state": "OH", "zip": "44805"},
    {"address": "201 W. Ohio Ave",                "city": "Dover",            "state": "OH", "zip": "44622"},
    {"address": "4716 State Route 39",            "city": "Millersburg",      "state": "OH", "zip": "44654"},
    {"address": "450A Canal Street SE",           "city": "Bolivar",          "state": "OH", "zip": "44612"},
    {"address": "1215 West Main Cross Street",    "city": "Findlay",          "state": "OH", "zip": "45840"},
    {"address": "7397 Canton Road NW",            "city": "Malvern",          "state": "OH", "zip": "44644"},
    {"address": "8015 Hills and Dales Rd NW",     "city": "Massillon",        "state": "OH", "zip": "44646"},
    {"address": "507 Crawford Street",            "city": "Martins Ferry",    "state": "OH", "zip": "43935"},
    {"address": "102 McCauley Drive",             "city": "Uhrichsville",     "state": "OH", "zip": "44683"},
    {"address": "246 Marietta Street",            "city": "St. Clairsville",  "state": "OH", "zip": "43950"},
    {"address": "6356 Market Ave N",              "city": "Canton",           "state": "OH", "zip": "44721"},
    {"address": "220 S. Columbus Ave",            "city": "Wooster",          "state": "OH", "zip": "44691"},
    {"address": "5 W Buckeye St",                 "city": "West Salem",       "state": "OH", "zip": "44287"},
    {"address": "4105 Cleveland Ave SW",          "city": "Canton",           "state": "OH", "zip": "44707"},
    {"address": "2506 Locust St NE",              "city": "Canal Fulton",     "state": "OH", "zip": "44614"},
    {"address": "100 Commercial Ave SE",          "city": "New Philadelphia", "state": "OH", "zip": "44663"},
]

# ── Logging ────────────────────────────────────────────────────────────────────

def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

# ── HTTP helpers ───────────────────────────────────────────────────────────────

def http_json(method, url, headers=None, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise Exception(f'HTTP {e.code}: {e.read().decode()[:200]}')

def dfs_post(path, payload):
    import base64
    headers = {
        'Authorization': f'Basic {DATAFORSEO_KEY}',
        'Content-Type': 'application/json',
    }
    return http_json('POST', f'https://api.dataforseo.com{path}', headers=headers, body=payload)

def sb_req(method, path, body=None):
    headers = {
        'apikey': SUPABASE_ANON,
        'Authorization': f'Bearer {SUPABASE_ANON}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    return http_json(method, f'{SUPABASE_URL}{path}', headers=headers, body=body)

def edge_post(fn, body):
    headers = {
        'Authorization': f'Bearer {SUPABASE_ANON}',
        'Content-Type': 'application/json',
    }
    return http_json('POST', f'{EDGE_BASE}/{fn}', headers=headers, body=body)

# ── Slug helpers ───────────────────────────────────────────────────────────────

def slugify(s):
    s = s.lower().strip()
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'\s+', '-', s)
    return re.sub(r'-+', '-', s).strip('-')

def make_unique_slug(name, existing_slugs):
    base = slugify(name)
    candidate, attempt = base, 0
    while candidate in existing_slugs:
        attempt += 1
        candidate = f'{base}-{attempt}'
    existing_slugs.add(candidate)
    return candidate

# ── DataForSEO helpers ─────────────────────────────────────────────────────────

def parse_hours(work_hours):
    if not work_hours:
        return None
    timetable = work_hours.get('timetable') or {}
    day_map = {
        'sunday':0,'monday':1,'tuesday':2,'wednesday':3,
        'thursday':4,'friday':5,'saturday':6
    }
    result = {}
    for day_name, slots in timetable.items():
        if not slots:
            result[day_name] = 'Closed'
            continue
        parts = []
        for slot in slots:
            oh = slot.get('open', {}) or {}
            cl = slot.get('close', {}) or {}
            oh_h = oh.get('hour', 0); oh_m = oh.get('minute', 0)
            cl_h = cl.get('hour', 0); cl_m = cl.get('minute', 0)
            def fmt(h, m):
                suffix = 'AM' if h < 12 else 'PM'
                h12 = h % 12 or 12
                return f'{h12}:{m:02d} {suffix}'
            if oh_h == 0 and cl_h == 0 and oh_m == 0 and cl_m == 0:
                parts.append('Open 24 hours')
            else:
                parts.append(f'{fmt(oh_h, oh_m)} - {fmt(cl_h, cl_m)}')
        result[day_name] = ', '.join(parts)
    return result if result else None

def parse_address_info(addr_info):
    if not addr_info:
        return {}, None, None, ''
    street_parts = [addr_info.get('address') or '']
    address = ', '.join(p for p in street_parts if p).strip()
    city    = addr_info.get('city') or addr_info.get('borough') or ''
    state   = addr_info.get('region') or ''
    zip_    = addr_info.get('zip') or ''
    if len(state) > 2:
        STATE_ABB = {
            'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
            'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
            'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
            'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
            'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
            'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV',
            'New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY',
            'North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
            'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
            'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
            'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI',
            'Wyoming':'WY','District of Columbia':'DC',
        }
        state = STATE_ABB.get(state, state[:2].upper())
    return address, city, state, zip_

def lookup_location(name, address, city, state):
    keyword = f'BellStores {address} {city} {state}'
    r = dfs_post('/v3/business_data/google/my_business_info/live', [{
        'keyword': keyword,
        'location_name': 'United States',
        'language_code': 'en',
    }])
    task = r['tasks'][0]
    if task.get('status_code') != 20000:
        raise Exception(f"DFS {task.get('status_code')}: {task.get('status_message')}")
    result = task.get('result')
    if not result or not result[0].get('items'):
        return None
    item = result[0]['items'][0]

    addr_info = item.get('address_info') or {}
    found_state = addr_info.get('region') or ''
    if len(found_state) > 2:
        STATE_ABB = {'Ohio':'OH','Pennsylvania':'PA','West Virginia':'WV'}
        found_state = STATE_ABB.get(found_state, found_state[:2].upper())

    # Sanity: must be in OH
    if found_state.upper() != 'OH':
        return None

    pid = item.get('place_id') or None
    if not pid:
        for link in (item.get('local_business_links') or []):
            m = re.search(r'place_id:([A-Za-z0-9_-]+)', link.get('url', ''))
            if m:
                pid = m.group(1)
                break

    parsed_addr, parsed_city, parsed_state, parsed_zip = parse_address_info(addr_info)

    return {
        'place_id':    pid,
        'name':        item.get('title') or name,
        'address':     parsed_addr or address,
        'city':        parsed_city or city,
        'state':       parsed_state or state,
        'zip':         parsed_zip or '',
        'phone':       item.get('phone') or None,
        'website':     item.get('url') or None,
        'latitude':    (item.get('coordinate') or {}).get('latitude'),
        'longitude':   (item.get('coordinate') or {}).get('longitude'),
        'hours':       parse_hours(item.get('work_hours')),
        'rating':      item.get('rating', {}).get('value') if item.get('rating') else None,
        'review_count':item.get('rating', {}).get('votes_count') if item.get('rating') else None,
    }

# ── Progress ───────────────────────────────────────────────────────────────────

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {'processed': [], 'inserted': [], 'updated': [], 'skipped': [], 'errors': []}

def save_progress(p):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(p, f, indent=2)

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    log('=' * 60)
    log('BellStores car wash import (unclassified — review mining will classify)')
    log('=' * 60)

    progress = load_progress()
    processed_set = set(progress['processed'])

    # Load existing slugs
    log('Loading existing slugs...')
    existing_slugs = set()
    offset = 0
    while True:
        rows = sb_req('GET', f'/rest/v1/listings?select=slug&limit=1000&offset={offset}')
        for r in rows:
            if r.get('slug'):
                existing_slugs.add(r['slug'])
        if len(rows) < 1000:
            break
        offset += 1000
    log(f'Loaded {len(existing_slugs)} existing slugs')

    # Load existing addresses + place IDs
    log('Loading existing addresses and place IDs...')
    existing_addresses = set()
    existing_place_ids = {}
    offset = 0
    while True:
        rows = sb_req('GET', f'/rest/v1/listings?select=id,address,city,state,google_place_id&limit=1000&offset={offset}')
        for r in rows:
            if r.get('address') and r.get('city') and r.get('state'):
                key = f"{r['address'].lower().strip()}|{r['city'].lower().strip()}|{r['state'].upper().strip()}"
                existing_addresses.add(key)
            if r.get('google_place_id'):
                existing_place_ids[r['google_place_id']] = r['id']
        if len(rows) < 1000:
            break
        offset += 1000
    log(f'Loaded {len(existing_addresses)} address records, {len(existing_place_ids)} place IDs')

    inserted = skipped = errors = 0

    for loc in BELLSTORES_LOCATIONS:
        key = f"{loc['address'].lower().strip()}|{loc['city'].lower().strip()}|{loc['state'].upper().strip()}"

        if key in processed_set:
            skipped += 1
            continue

        # Skip if address already in DB
        if key in existing_addresses:
            log(f'  SKIP (in DB): {loc["address"]}, {loc["city"]}, {loc["state"]}')
            skipped += 1
            progress['processed'].append(key)
            progress['skipped'].append({'address': loc['address'], 'reason': 'address_in_db'})
            save_progress(progress)
            continue

        try:
            data = lookup_location('BellStores', loc['address'], loc['city'], loc['state'])
        except Exception as e:
            log(f'  ERROR {loc["address"]}, {loc["city"]}: {e}')
            errors += 1
            progress['processed'].append(key)
            progress['errors'].append({'address': loc['address'], 'city': loc['city'], 'error': str(e)})
            save_progress(progress)
            continue

        if not data:
            log(f'  NOT FOUND: {loc["address"]}, {loc["city"]}, {loc["state"]}')
            errors += 1
            progress['processed'].append(key)
            progress['errors'].append({'address': loc['address'], 'city': loc['city'], 'error': 'No search results'})
            save_progress(progress)
            continue

        # If place_id already in DB, check if we should update is_approved
        if data['place_id'] and data['place_id'] in existing_place_ids:
            log(f'  ALREADY IN DB (place_id): {loc["address"]}, {loc["city"]} → {data["name"]}')
            skipped += 1
            progress['processed'].append(key)
            progress['skipped'].append({'address': loc['address'], 'reason': 'place_id_in_db'})
            save_progress(progress)
            continue

        slug = make_unique_slug(data['name'], existing_slugs)

        listing = {
            'slug':               slug,
            'name':               data['name'],
            'address':            data['address'] or loc['address'],
            'city':               data['city'] or loc['city'],
            'state':              data['state'] or loc['state'],
            'zip':                data['zip'] or loc.get('zip', ''),
            'phone':              data['phone'],
            'website':            data['website'],
            'latitude':           data['latitude'],
            'longitude':          data['longitude'],
            'hours':              data['hours'],
            'rating':             data['rating'],
            'review_count':       data['review_count'],
            'google_place_id':    data['place_id'],
            # Unclassified — review mining will determine if touchless
            'is_touchless':       None,
            'touchless_verified': None,
            'is_approved':        None,
            'review_mine_status': None,
            'crawl_notes':        'BellStores car wash location — wash type TBD by review mining (chain operates both Touch Free and Soft Touch)',
        }

        try:
            result = sb_req('POST', '/rest/v1/listings', body=listing)
            inserted_id = result[0]['id'] if result else None
            log(f'  ✓ {data["name"]} — {data["city"]}, {data["state"]} [{inserted_id}]')
            inserted += 1
            progress['processed'].append(key)
            progress['inserted'].append({'id': inserted_id, 'name': data['name'], 'city': data['city']})
            save_progress(progress)
        except Exception as e:
            log(f'  INSERT ERROR {loc["address"]}: {e}')
            errors += 1
            progress['errors'].append({'address': loc['address'], 'error': str(e)})
            save_progress(progress)
            continue

        time.sleep(0.5)

    log('')
    log(f'Done. Inserted: {inserted} | Skipped: {skipped} | Errors: {errors}')
    log(f'Total in DB from BellStores: {len(progress["inserted"])}')

    # Phase 2: review mining for all inserted BellStores listings
    if progress['inserted']:
        log('')
        log('Phase 2: Review mining for inserted listings...')
        log('Running scan_batch to collect reviews (no revert — unclassified)...')
        complete = False
        batch = 0
        while not complete:
            batch += 1
            try:
                resp = edge_post('review-mine', {'action': 'scan_batch', 'batch_size': 50})
                done = resp.get('complete', False)
                scanned = resp.get('scanned', 0)
                found = resp.get('touchless_found', 0)
                log(f'  Batch {batch}: scanned={scanned} touchless_found={found} complete={done}')
                if done:
                    complete = True
                    break
                time.sleep(2)
            except Exception as e:
                log(f'  scan_batch error: {e}')
                time.sleep(5)

        log('Review mining complete.')

if __name__ == '__main__':
    main()
