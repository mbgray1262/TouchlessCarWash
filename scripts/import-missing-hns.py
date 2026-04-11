#!/usr/bin/env python3
"""
Import missing H&S Energy Group car wash locations.

Phase 1: DataForSEO lookup + insert (with review mining)
Phase 2: Full enrichment (google-enrich + photo-enrich + descriptions + amenities)

Run: python3 scripts/import-missing-hns.py
"""
import os, json, re, ssl, urllib.request, urllib.error, time, datetime

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

DATAFORSEO_KEY = 'bWljaGFlbEB0b3VjaGxlc3NjYXJ3YXNoZmluZGVyLmNvbTo0ZTQyOWQxMjdhOTExZDdh'
SUPABASE_URL   = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
EDGE_BASE      = f'{SUPABASE_URL}/functions/v1'

SCRIPT_DIR     = os.path.dirname(__file__)
LOG_FILE       = os.path.join(SCRIPT_DIR, 'import-missing-hns.log')
PROGRESS_FILE  = os.path.join(SCRIPT_DIR, 'import-missing-hns-progress.json')

STATE_NAMES = {
    'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'California',
    'CO':'Colorado','CT':'Connecticut','DE':'Delaware','FL':'Florida','GA':'Georgia',
    'HI':'Hawaii','ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa',
    'KS':'Kansas','KY':'Kentucky','LA':'Louisiana','ME':'Maine','MD':'Maryland',
    'MA':'Massachusetts','MI':'Michigan','MN':'Minnesota','MS':'Mississippi','MO':'Missouri',
    'MT':'Montana','NE':'Nebraska','NV':'Nevada','NH':'New Hampshire','NJ':'New Jersey',
    'NM':'New Mexico','NY':'New York','NC':'North Carolina','ND':'North Dakota','OH':'Ohio',
    'OK':'Oklahoma','OR':'Oregon','PA':'Pennsylvania','RI':'Rhode Island','SC':'South Carolina',
    'SD':'South Dakota','TN':'Tennessee','TX':'Texas','UT':'Utah','VT':'Vermont',
    'VA':'Virginia','WA':'Washington','WV':'West Virginia','WI':'Wisconsin','WY':'Wyoming',
    'DC':'District of Columbia',
}

# ── Missing locations (114 total) ─────────────────────────────────────────
MISSING_LOCATIONS = [
    # Extra Mile (54 missing)
    {"addr": "3085 E La Palma Ave", "city": "Anaheim", "state": "CA", "brand": "Extra Mile"},
    {"addr": "1101 N Magnolia Ave", "city": "Anaheim", "state": "CA", "brand": "Extra Mile"},
    {"addr": "4600 Lone Tree Wy", "city": "Antioch", "state": "CA", "brand": "Extra Mile"},
    {"addr": "251 E Grand Ave", "city": "Arroyo Grande", "state": "CA", "brand": "Extra Mile"},
    {"addr": "336 Oak St", "city": "Brentwood", "state": "CA", "brand": "Extra Mile"},
    {"addr": "206 E Hwy 246", "city": "Buellton", "state": "CA", "brand": "Extra Mile"},
    {"addr": "6971 Beach Blvd", "city": "Buena Park", "state": "CA", "brand": "Extra Mile"},
    {"addr": "7990 Valley View St", "city": "Buena Park", "state": "CA", "brand": "Extra Mile"},
    {"addr": "3381 Coach Ln", "city": "Cameron Park", "state": "CA", "brand": "Extra Mile"},
    {"addr": "13356 E. South St", "city": "Cerritos", "state": "CA", "brand": "Extra Mile"},
    {"addr": "12886 Central Ave", "city": "Chino", "state": "CA", "brand": "Extra Mile"},
    {"addr": "221 S Hacienda Blvd", "city": "City of Industry", "state": "CA", "brand": "Extra Mile"},
    {"addr": "699 E Foothill Blvd", "city": "Claremont", "state": "CA", "brand": "Extra Mile"},
    {"addr": "860 S Indian Hill Blvd", "city": "Claremont", "state": "CA", "brand": "Extra Mile"},
    {"addr": "5999 Cerritos Ave", "city": "Cypress", "state": "CA", "brand": "Extra Mile"},
    {"addr": "32842 CA-1", "city": "Dana Point", "state": "CA", "brand": "Extra Mile"},
    {"addr": "21095 Golden Springs Dr", "city": "Diamond Bar", "state": "CA", "brand": "Extra Mile"},
    {"addr": "150 S Diamond Bar Blvd", "city": "Diamond Bar", "state": "CA", "brand": "Extra Mile"},
    {"addr": "8900 Madison Ave", "city": "Fair Oaks", "state": "CA", "brand": "Extra Mile"},
    {"addr": "9881 Greenback Ln", "city": "Folsom", "state": "CA", "brand": "Extra Mile"},
    {"addr": "1020 Riley St", "city": "Folsom", "state": "CA", "brand": "Extra Mile"},
    {"addr": "16705 Merrill Ave", "city": "Fontana", "state": "CA", "brand": "Extra Mile"},
    {"addr": "1730 W Orangethorpe Ave", "city": "Fullerton", "state": "CA", "brand": "Extra Mile"},
    {"addr": "11971 Valley View St", "city": "Garden Grove", "state": "CA", "brand": "Extra Mile"},
    {"addr": "850 W Rosecrans Ave", "city": "Gardena", "state": "CA", "brand": "Extra Mile"},
    {"addr": "25991 Crown Valley Pkwy", "city": "Laguna Niguel", "state": "CA", "brand": "Extra Mile"},
    {"addr": "5739 Bellflower Blvd", "city": "Lakewood", "state": "CA", "brand": "Extra Mile"},
    {"addr": "4910 Lakewood Blvd", "city": "Lakewood", "state": "CA", "brand": "Extra Mile"},
    {"addr": "671 Lincoln Blvd", "city": "Lincoln", "state": "CA", "brand": "Extra Mile"},
    {"addr": "14000 CA-88", "city": "Lockeford", "state": "CA", "brand": "Extra Mile"},
    {"addr": "1628 E Washington Blvd", "city": "Montebello", "state": "CA", "brand": "Extra Mile"},
    {"addr": "1500 S Paramount Blvd", "city": "Montebello", "state": "CA", "brand": "Extra Mile"},
    {"addr": "656 Benet Rd", "city": "Oceanside", "state": "CA", "brand": "Extra Mile"},
    {"addr": "2844 N Santiago Blvd", "city": "Orange", "state": "CA", "brand": "Extra Mile"},
    {"addr": "1440 E Washington St", "city": "Petaluma", "state": "CA", "brand": "Extra Mile"},
    {"addr": "1903 W Holt Ave", "city": "Pomona", "state": "CA", "brand": "Extra Mile"},
    {"addr": "750 Atlantic St", "city": "Roseville", "state": "CA", "brand": "Extra Mile"},
    {"addr": "1400 E Roseville Pkwy", "city": "Roseville", "state": "CA", "brand": "Extra Mile"},
    {"addr": "3300 Bradshaw Rd", "city": "Sacramento", "state": "CA", "brand": "Extra Mile"},
    {"addr": "9700 Jackson Rd", "city": "Sacramento", "state": "CA", "brand": "Extra Mile"},
    {"addr": "2150 Marconi Ave", "city": "Sacramento", "state": "CA", "brand": "Extra Mile"},
    {"addr": "5597 Stockton Blvd", "city": "Sacramento", "state": "CA", "brand": "Extra Mile"},
    {"addr": "14791 CA-1", "city": "Santa Monica", "state": "CA", "brand": "Extra Mile"},
    {"addr": "2950 Westminster Blvd", "city": "Seal Beach", "state": "CA", "brand": "Extra Mile"},
    {"addr": "1105 Santa Anita Ave", "city": "South El Monte", "state": "CA", "brand": "Extra Mile"},
    {"addr": "6633 Pacific Ave", "city": "Stockton", "state": "CA", "brand": "Extra Mile"},
    {"addr": "3775 N Tracy Blvd", "city": "Tracy", "state": "CA", "brand": "Extra Mile"},
    {"addr": "14082 Red Hill Ave", "city": "Tustin", "state": "CA", "brand": "Extra Mile"},
    {"addr": "182 Nut Tree Pkwy", "city": "Vacaville", "state": "CA", "brand": "Extra Mile"},
    {"addr": "1991 Broadway", "city": "Vallejo", "state": "CA", "brand": "Extra Mile"},
    {"addr": "223 Fairgrounds Dr", "city": "Vallejo", "state": "CA", "brand": "Extra Mile"},
    {"addr": "20849 E Valley Blvd", "city": "Walnut", "state": "CA", "brand": "Extra Mile"},
    {"addr": "1851 Main St", "city": "Watsonville", "state": "CA", "brand": "Extra Mile"},
    {"addr": "14941 E. Whittier Blvd", "city": "Whittier", "state": "CA", "brand": "Extra Mile"},
    # Power Market (57 missing)
    {"addr": "12589 E Highway 20", "city": "Clearlake Oaks", "state": "CA", "brand": "Power Market"},
    {"addr": "604 S Coast Hwy", "city": "Laguna Beach", "state": "CA", "brand": "Power Market"},
    {"addr": "30072 Crown Valley Pkwy", "city": "Laguna Niguel", "state": "CA", "brand": "Power Market"},
    {"addr": "9815 Highway 53", "city": "Lower Lake", "state": "CA", "brand": "Power Market"},
    {"addr": "6282 E Highway 20", "city": "Lucerne", "state": "CA", "brand": "Power Market"},
    {"addr": "7825 Telegraph Rd", "city": "Montebello", "state": "CA", "brand": "Power Market"},
    {"addr": "3475 Main St", "city": "Oakley", "state": "CA", "brand": "Power Market"},
    {"addr": "4217 Arboga Rd", "city": "Olivehurst", "state": "CA", "brand": "Power Market"},
    {"addr": "1805 Willow Pass Rd", "city": "Pittsburg", "state": "CA", "brand": "Power Market"},
    {"addr": "1670 Hartnell Ave", "city": "Redding", "state": "CA", "brand": "Power Market"},
    {"addr": "8908 Elder Creek Rd", "city": "Sacramento", "state": "CA", "brand": "Power Market"},
    {"addr": "2986 US Hwy 50", "city": "South Lake Tahoe", "state": "CA", "brand": "Power Market"},
    {"addr": "4155 Suisun Valley Rd", "city": "Suisun City", "state": "CA", "brand": "Power Market"},
    {"addr": "1491 E Monte Vista Ave", "city": "Vacaville", "state": "CA", "brand": "Power Market"},
    {"addr": "900 Mason St", "city": "Vacaville", "state": "CA", "brand": "Power Market"},
    {"addr": "251 Lincoln Blvd", "city": "Venice", "state": "CA", "brand": "Power Market"},
    {"addr": "805 Market St", "city": "Colusa", "state": "CA", "brand": "Power Market"},
    {"addr": "809 Solano St", "city": "Corning", "state": "CA", "brand": "Power Market"},
    {"addr": "1006 US Highway 101 N", "city": "Crescent City", "state": "CA", "brand": "Power Market"},
    {"addr": "900 US Highway 101 N", "city": "Crescent City", "state": "CA", "brand": "Power Market"},
    {"addr": "88w CA-4", "city": "Murphys", "state": "CA", "brand": "Power Market"},
    {"addr": "790 Tahoe Blvd", "city": "Incline Village", "state": "NV", "brand": "Power Market"},
    {"addr": "22025 S Beavercreek Rd", "city": "Beavercreek", "state": "OR", "brand": "Power Market"},
    {"addr": "262 SE 1st Ave", "city": "Canby", "state": "OR", "brand": "Power Market"},
    {"addr": "10596 SE Hwy 212", "city": "Clackamas", "state": "OR", "brand": "Power Market"},
    {"addr": "19805 McLoughlin Blvd", "city": "Gladstone", "state": "OR", "brand": "Power Market"},
    {"addr": "52530 Hwy 97", "city": "La Pine", "state": "OR", "brand": "Power Market"},
    {"addr": "13939 SE McLoughlin Blvd", "city": "Milwaukie", "state": "OR", "brand": "Power Market"},
    {"addr": "3046 SE Harrison St", "city": "Milwaukie", "state": "OR", "brand": "Power Market"},
    {"addr": "13001 Clackamas River Dr", "city": "Oregon City", "state": "OR", "brand": "Power Market"},
    {"addr": "1511 Molalla Ave", "city": "Oregon City", "state": "OR", "brand": "Power Market"},
    {"addr": "2409 NE Butler Market Rd", "city": "Bend", "state": "OR", "brand": "Power Market"},
    {"addr": "125 Depot St", "city": "Rogue River", "state": "OR", "brand": "Power Market"},
    {"addr": "2232 Biddle Rd", "city": "Medford", "state": "OR", "brand": "Power Market"},
    {"addr": "1325 Court St", "city": "Medford", "state": "OR", "brand": "Power Market"},
    {"addr": "417 E Barnett Rd", "city": "Medford", "state": "OR", "brand": "Power Market"},
    {"addr": "785 Stewart Ave", "city": "Medford", "state": "OR", "brand": "Power Market"},
    {"addr": "345 W Harvard Ave", "city": "Roseburg", "state": "OR", "brand": "Power Market"},
    {"addr": "1137 Oregon St", "city": "Port Orford", "state": "OR", "brand": "Power Market"},
    {"addr": "125 NE Morgan Ln", "city": "Grants Pass", "state": "OR", "brand": "Power Market"},
    {"addr": "104 NE Morgan Ln", "city": "Grants Pass", "state": "OR", "brand": "Power Market"},
    {"addr": "730 Redwood Hwy", "city": "Grants Pass", "state": "OR", "brand": "Power Market"},
    {"addr": "1553 Williams Hwy", "city": "Grants Pass", "state": "OR", "brand": "Power Market"},
    {"addr": "2520 Foothill Blvd", "city": "Grants Pass", "state": "OR", "brand": "Power Market"},
    {"addr": "7640 Highway 62", "city": "White City", "state": "OR", "brand": "Power Market"},
    {"addr": "6779 OR-62", "city": "Central Point", "state": "OR", "brand": "Power Market"},
    {"addr": "2104 SE 6th St", "city": "Klamath Falls", "state": "OR", "brand": "Power Market"},
    {"addr": "1720 NW Hess St", "city": "Madras", "state": "OR", "brand": "Power Market"},
    {"addr": "969 NE 7th St", "city": "Bend", "state": "OR", "brand": "Power Market"},
    {"addr": "3305 N Hwy 97", "city": "Bend", "state": "OR", "brand": "Power Market"},
    {"addr": "1034 Chetco Ave", "city": "Brookings", "state": "OR", "brand": "Power Market"},
    {"addr": "10115 SE Hwy 212", "city": "Clackamas", "state": "OR", "brand": "Power Market"},
    {"addr": "2801 3rd St", "city": "Tillamook", "state": "OR", "brand": "Power Market"},
    {"addr": "9700 SW Tualatin-Sherwood Rd", "city": "Tualatin", "state": "OR", "brand": "Power Market"},
    {"addr": "1311 NW Lamonta Rd", "city": "Prineville", "state": "OR", "brand": "Power Market"},
    {"addr": "22015 S Beavercreek Rd", "city": "Beavercreek", "state": "OR", "brand": "Power Market"},
    {"addr": "1026 Chetco Ave", "city": "Brookings", "state": "OR", "brand": "Power Market"},
    # Pinnacle 365 (3 missing)
    {"addr": "1065 E Pine St", "city": "Central Point", "state": "OR", "brand": "Pinnacle 365"},
    {"addr": "692 NE Main St", "city": "Willamina", "state": "OR", "brand": "Pinnacle 365"},
    {"addr": "730 W Main St", "city": "Phoenix", "state": "OR", "brand": "Pinnacle 365"},
]

def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {'processed': [], 'inserted': [], 'updated': [], 'skipped': [], 'errors': [], 'new_ids': []}

def save_progress(p):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(p, f, indent=2)

def upscale_google_photo(url):
    if not url:
        return url
    if '/gps-cs-s/' in url:
        return None
    if 'googleusercontent.com' in url or 'lh3.google' in url:
        base = re.sub(r'=[^/=]+$', '', url)
        return f'{base}=w1600-h1200'
    return url

def dfs_post(path, body):
    req = urllib.request.Request(
        f'https://api.dataforseo.com{path}',
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': f'Basic {DATAFORSEO_KEY}'}
    )
    with urllib.request.urlopen(req, timeout=60, context=ssl_ctx) as r:
        return json.loads(r.read())

def sb_req(method, path, body=None, extra_headers=None):
    headers = {
        'apikey': SUPABASE_ANON,
        'Authorization': f'Bearer {SUPABASE_ANON}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(
        f'{SUPABASE_URL}{path}',
        data=json.dumps(body).encode() if body else None,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())

def edge_post(func, body):
    req = urllib.request.Request(
        f'{EDGE_BASE}/{func}',
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {SUPABASE_ANON}'}
    )
    with urllib.request.urlopen(req, timeout=150, context=ssl_ctx) as r:
        return json.loads(r.read())

def slugify(text):
    s = text.lower()
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

def parse_hours(work_hours):
    if not work_hours:
        return {}
    hours = {}
    timetable = work_hours.get('timetable') or {}
    day_map = {'sunday':'Sunday','monday':'Monday','tuesday':'Tuesday','wednesday':'Wednesday',
               'thursday':'Thursday','friday':'Friday','saturday':'Saturday'}
    for dk, dl in day_map.items():
        slots = timetable.get(dk)
        if slots is None:
            hours[dl] = 'Closed'
        elif slots == []:
            hours[dl] = 'Open 24 hours'
        else:
            parts = []
            for s in slots:
                oh = f"{s.get('open',{}).get('hour',0):02d}:{s.get('open',{}).get('minute',0):02d}"
                ch = f"{s.get('close',{}).get('hour',0):02d}:{s.get('close',{}).get('minute',0):02d}"
                parts.append(f'{oh}–{ch}')
            hours[dl] = ', '.join(parts)
    return hours

def lookup_location(search_name, address, city, state):
    keyword = f'{search_name} {address} {city} {state}'
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
        rev = {v: k for k, v in STATE_NAMES.items()}
        found_state = rev.get(found_state, found_state[:2].upper())
    if found_state.upper() != state.upper():
        return None

    pid = item.get('place_id') or None
    if not pid:
        for link in (item.get('local_business_links') or []):
            m = re.search(r'place_id:([A-Za-z0-9_-]+)', link.get('url', ''))
            if m:
                pid = m.group(1)
                break

    found_city = addr_info.get('city') or addr_info.get('borough') or ''
    phone = item.get('phone') or None
    website = item.get('url') or None
    rating = (item.get('rating') or {}).get('value') or 0
    review_count = (item.get('rating') or {}).get('votes_count') or 0
    lat = (item.get('coordinates') or {}).get('latitude')
    lng = (item.get('coordinates') or {}).get('longitude')
    description = item.get('description') or None
    category = item.get('category') or None
    zip_ = addr_info.get('zip') or ''
    street = (item.get('address') or address).split(',')[0].strip()
    hours = parse_hours(item.get('work_hours'))
    main_image = upscale_google_photo(item.get('main_image') or None)
    price_level = item.get('price_level')
    price_range = {1:'$',2:'$$',3:'$$$',4:'$$$$'}.get(price_level)

    google_maps_url = None
    for link in (item.get('local_business_links') or []):
        if 'google.com/maps' in (link.get('url') or ''):
            google_maps_url = link['url']
            break
    if not google_maps_url and pid:
        google_maps_url = f'https://www.google.com/maps/place/?q=place_id:{pid}'

    return {
        'name': item.get('title') or search_name,
        'address': street, 'city': found_city or city, 'state': found_state or state,
        'zip': zip_, 'phone': phone, 'website': website,
        'rating': float(rating) if rating else 0,
        'review_count': int(review_count) if review_count else 0,
        'latitude': float(lat) if lat else None,
        'longitude': float(lng) if lng else None,
        'google_description': description, 'google_category': category,
        'google_maps_url': google_maps_url, 'google_place_id': pid,
        'hours': hours, 'main_image': main_image, 'price_range': price_range,
    }

def main():
    log('=' * 60)
    log(f'H&S Energy missing locations import: {len(MISSING_LOCATIONS)} locations')
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

    # Load existing addresses
    log('Loading existing addresses...')
    existing_addresses = set()
    offset = 0
    while True:
        rows = sb_req('GET', f'/rest/v1/listings?select=address,city,state&limit=1000&offset={offset}')
        for r in rows:
            if r.get('address') and r.get('city') and r.get('state'):
                key = f"{r['address'].lower().strip()}|{r['city'].lower().strip()}|{r['state'].upper().strip()}"
                existing_addresses.add(key)
        if len(rows) < 1000:
            break
        offset += 1000
    log(f'Loaded {len(existing_addresses)} existing address records')

    inserted = skipped = errors = 0

    for i, loc in enumerate(MISSING_LOCATIONS):
        key = f"{loc['addr'].lower()}|{loc['city'].lower()}|{loc['state'].upper()}"
        if key in processed_set:
            skipped += 1
            continue
        if key in existing_addresses:
            log(f'  SKIP (in DB): {loc["addr"]}, {loc["city"]}, {loc["state"]}')
            skipped += 1
            progress['processed'].append(key)
            processed_set.add(key)
            continue

        # Use brand name for DataForSEO search
        search_name = loc['brand']
        try:
            data = lookup_location(search_name, loc['addr'], loc['city'], loc['state'])
        except Exception as e:
            errors += 1
            log(f'  ERROR {loc["addr"]}, {loc["city"]}: {e}')
            progress['processed'].append(key)
            progress['errors'].append({'addr': loc['addr'], 'city': loc['city'], 'error': str(e)})
            processed_set.add(key)
            if errors % 10 == 0:
                save_progress(progress)
            time.sleep(1)
            continue

        if data is None:
            log(f'  NOT FOUND: {loc["addr"]}, {loc["city"]}, {loc["state"]}')
            skipped += 1
            progress['processed'].append(key)
            progress['skipped'].append({'addr': loc['addr'], 'city': loc['city'], 'reason': 'not_found'})
            processed_set.add(key)
            time.sleep(0.15)
            continue

        # Place ID dedup
        if data.get('google_place_id'):
            try:
                existing = sb_req('GET', f'/rest/v1/listings?google_place_id=eq.{data["google_place_id"]}&select=id,is_touchless,touchless_verified,parent_chain')
                if existing:
                    ex = existing[0]
                    if not ex.get('parent_chain'):
                        sb_req('PATCH', f'/rest/v1/listings?id=eq.{ex["id"]}', {
                            'is_touchless': True, 'is_approved': True,
                            'touchless_verified': 'chain',
                            'parent_chain': loc['brand'],
                            'crawl_notes': 'Confirmed touchless by hnsenergygroup.com',
                        })
                        log(f'  UPDATED (place_id match): {data["name"]} — {data["city"]}, {data["state"]}')
                        progress['new_ids'].append(ex['id'])
                    else:
                        log(f'  SKIP (place_id in DB): {data["name"]}')
                    skipped += 1
                    progress['processed'].append(key)
                    processed_set.add(key)
                    existing_addresses.add(key)
                    time.sleep(0.15)
                    continue
            except Exception:
                pass

        slug = make_unique_slug(data['name'], existing_slugs)
        listing = {
            'name': data['name'], 'slug': slug,
            'address': data['address'], 'city': data['city'],
            'state': data['state'], 'zip': data['zip'] or '',
            'phone': data['phone'], 'website': data['website'],
            'rating': data['rating'], 'review_count': data['review_count'],
            'latitude': data['latitude'], 'longitude': data['longitude'],
            'google_description': data['google_description'],
            'google_category': data['google_category'],
            'google_maps_url': data['google_maps_url'],
            'google_place_id': data['google_place_id'],
            'hero_image': data['main_image'],
            'google_photo_url': data['main_image'],
            'photos': [data['main_image']] if data['main_image'] else [],
            'hours': data['hours'] or {},
            'wash_packages': [], 'amenities': [],
            'price_range': data['price_range'],
            'is_touchless': True, 'is_approved': True, 'is_featured': False,
            'touchless_verified': 'chain',
            'parent_chain': loc['brand'],
            'review_mine_status': None,
            'crawl_status': 'classified',
            'crawl_notes': 'Confirmed touchless by hnsenergygroup.com',
        }

        try:
            result = sb_req('POST', '/rest/v1/listings', listing)
            inserted += 1
            inserted_id = result[0]['id'] if result else None
            if inserted_id:
                progress['new_ids'].append(inserted_id)
            log(f'  ✓ {data["name"]} — {data["city"]}, {data["state"]}')
            progress['processed'].append(key)
            progress['inserted'].append({'id': inserted_id, 'name': data['name'], 'city': data['city'], 'state': data['state'], 'brand': loc['brand']})
            processed_set.add(key)
            existing_addresses.add(key)
        except Exception as e:
            errors += 1
            log(f'  INSERT ERROR {data["name"]}: {e}')
            progress['errors'].append({'addr': loc['addr'], 'error': f'insert: {e}'})
            progress['processed'].append(key)
            processed_set.add(key)

        if (i + 1) % 25 == 0:
            log(f'  Progress: {i+1}/{len(MISSING_LOCATIONS)} | inserted={inserted} skipped={skipped} errors={errors}')
            save_progress(progress)

        time.sleep(0.15)

    save_progress(progress)
    log(f'\nPhase 1 complete: {inserted} inserted | {skipped} skipped | {errors} errors')

    # Phase 2: Review mining
    log('\n--- Phase 2: Review mining ---')
    batch = 0
    total_scanned = 0
    start = time.time()
    while True:
        try:
            r = edge_post('review-mine', {
                'action': 'scan_batch', 'batch_size': 50, 'all_listings': True,
            })
            scanned = r.get('scanned_this_batch', 0)
            complete = r.get('complete', False)
            batch += 1
            total_scanned += scanned
            elapsed = int(time.time() - start)
            log(f'Batch {batch}: scanned={scanned} ({elapsed}s)')
            if complete or scanned == 0:
                log('Review mining complete.')
                break
            time.sleep(3)
        except Exception as e:
            log(f'Mining error: {e}')
            time.sleep(10)

    # Phase 3: Full enrichment for all new listings
    new_ids = progress.get('new_ids', [])
    if new_ids:
        log(f'\n--- Phase 3: Full enrichment for {len(new_ids)} listings ---')
        # Process in batches of 10
        for batch_start in range(0, len(new_ids), 10):
            batch_ids = new_ids[batch_start:batch_start + 10]
            log(f'  Enriching batch {batch_start // 10 + 1} ({len(batch_ids)} listings)...')
            try:
                # Call the enrich-listing API with mode=full
                body = json.dumps({'listingIds': batch_ids, 'mode': 'full', 'force': True}).encode()
                req = urllib.request.Request(
                    'http://localhost:3000/api/enrich-listing',
                    data=body,
                    headers={'Content-Type': 'application/json'},
                    method='POST',
                )
                with urllib.request.urlopen(req, timeout=300, context=ssl_ctx) as r:
                    result = json.loads(r.read())
                steps = result.get('steps', [])
                for s in steps:
                    log(f'    {s["name"]}: {s["status"]} — {s.get("detail","")}')
            except Exception as e:
                log(f'  Enrichment error: {e}')
                # Try calling edge functions directly as fallback
                try:
                    log('  Trying direct edge function calls...')
                    ge = edge_post('google-enrich', {'action': 'enrich_batch', 'listing_ids': batch_ids, 'force': True})
                    log(f'    google-enrich: ok={ge.get("ok",0)} errors={ge.get("errors",0)}')
                    pe = edge_post('photo-enrich', {'action': 'start', 'listing_ids': batch_ids})
                    log(f'    photo-enrich: job_id={pe.get("job_id","n/a")}')
                    gd = edge_post('generate-descriptions', {'action': 'start', 'listing_ids': batch_ids, 'regenerate': True})
                    log(f'    generate-descriptions: job_id={gd.get("job_id","n/a")}')
                    ab = edge_post('amenity-backfill', {'action': 'start', 'listing_ids': batch_ids})
                    log(f'    amenity-backfill: job_id={ab.get("job_id","n/a")}')
                except Exception as e2:
                    log(f'  Direct edge function error: {e2}')
            time.sleep(2)
    else:
        log('\nNo new listings to enrich.')

    log('\n' + '=' * 60)
    log('IMPORT COMPLETE')
    log(f'  New listings: {inserted}')
    log(f'  Skipped:      {skipped}')
    log(f'  Errors:       {errors}')
    log(f'  Enriched:     {len(new_ids)}')
    log('=' * 60)

if __name__ == '__main__':
    main()
