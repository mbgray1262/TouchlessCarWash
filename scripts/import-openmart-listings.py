#!/usr/bin/env python3
"""
OpenMart Place ID import pipeline.

Phase 1: Enrich 5,319 Place IDs via DataForSEO my_business_info/live
          → Creates listings in Supabase with full business data
          → Skips if place_id already exists in DB
          → Skips if listing is clearly not a car wash

Phase 2: Review mining via scan_batch Edge Function
          → Fetches 100 reviews per listing, verifies touchless, inserts snippets
          → All listings get reviewed regardless of name (for quality signals)

Phase 3: Name-promotion
          → Listings still is_touchless=null after mining but with obvious
            touchless names are promoted to is_touchless=true
          → Everything else stays null (not shown in directory)

Progress is saved to scripts/import-openmart-progress.json so the script
can be safely interrupted and resumed.

Logs to: scripts/import-openmart.log
"""
import os, json, ssl, urllib.request, urllib.parse, time, datetime, re, math

def upscale_google_photo(url):
    """Upscale Google Photos URLs to w1600-h1200. Reject expiring gps-cs-s session tokens."""
    if not url:
        return url
    # gps-cs-s URLs contain short-lived session tokens — they expire within hours
    if '/gps-cs-s/' in url:
        return None
    if 'googleusercontent.com' in url or 'lh3.google' in url:
        base = re.sub(r'=[^/=]+$', '', url)
        return f'{base}=w1600-h1200'
    return url

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

DATAFORSEO_KEY = 'bWljaGFlbEB0b3VjaGxlc3NjYXJ3YXNoZmluZGVyLmNvbTo0ZTQyOWQxMjdhOTExZDdh'
SUPABASE_URL   = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
EDGE_BASE      = f'{SUPABASE_URL}/functions/v1'

SCRIPT_DIR     = os.path.dirname(__file__)
LOG_FILE       = os.path.join(SCRIPT_DIR, 'import-openmart.log')
PROGRESS_FILE  = os.path.join(SCRIPT_DIR, 'import-openmart-progress.json')
PLACE_IDS_FILE = os.path.join(SCRIPT_DIR, 'openmart-net-new-place-ids.json')

TOUCHLESS_NAME_RE = re.compile(
    r'touch\s*-?\s*less|touch\s*-?\s*free|no[\s-]touch|laser\s*wash|'
    r'brush\s*-?\s*less|brush\s*-?\s*free|touchfree|laserwash|laser\s+car\s+wash',
    re.IGNORECASE
)

# ── Logging ───────────────────────────────────────────────────────────────────

def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

# ── Progress tracking ─────────────────────────────────────────────────────────

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {'processed': [], 'inserted': [], 'skipped': [], 'errors': []}

def save_progress(progress):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f, indent=2)

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def dfs_post(path, body):
    req = urllib.request.Request(
        f'https://api.dataforseo.com{path}',
        data=json.dumps(body).encode(),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Basic {DATAFORSEO_KEY}',
        }
    )
    with urllib.request.urlopen(req, timeout=60, context=ssl_ctx) as r:
        return json.loads(r.read())

def sb_get(path):
    req = urllib.request.Request(
        f'{SUPABASE_URL}{path}',
        headers={'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}'}
    )
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())

def sb_post(path, body):
    req = urllib.request.Request(
        f'{SUPABASE_URL}{path}',
        data=json.dumps(body).encode(),
        headers={
            'apikey': SUPABASE_ANON,
            'Authorization': f'Bearer {SUPABASE_ANON}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
        }
    )
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())

def edge_post(func, body):
    req = urllib.request.Request(
        f'{EDGE_BASE}/{func}',
        data=json.dumps(body).encode(),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {SUPABASE_ANON}',
        }
    )
    with urllib.request.urlopen(req, timeout=150, context=ssl_ctx) as r:
        return json.loads(r.read())

# ── Slug generation ───────────────────────────────────────────────────────────

def slugify(text):
    s = text.lower()
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'\s+', '-', s)
    s = re.sub(r'-+', '-', s)
    return s.strip('-')

def make_unique_slug(name, existing_slugs):
    base = slugify(name)
    candidate = base
    attempt = 0
    while candidate in existing_slugs:
        attempt += 1
        candidate = f'{base}-{attempt}'
    existing_slugs.add(candidate)
    return candidate

# ── DataForSEO my_business_info parser ───────────────────────────────────────

def parse_address_info(info):
    """Extract city, state, zip from DataForSEO address_info dict."""
    if not info:
        return '', '', ''
    city  = info.get('city') or info.get('borough') or ''
    state = info.get('region') or ''
    zip_  = info.get('zip') or ''
    # state might be full name — shorten if needed using abbreviation map
    STATE_ABBR = {
        'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
        'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
        'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
        'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
        'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
        'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV',
        'New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY',
        'North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
        'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
        'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT',
        'Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV',
        'Wisconsin':'WI','Wyoming':'WY','District of Columbia':'DC',
    }
    if len(state) > 2:
        state = STATE_ABBR.get(state, state[:2].upper())
    return city, state.upper(), zip_

def parse_hours(work_hours):
    """Convert DataForSEO work_hours to our {day: hours_string} format."""
    if not work_hours:
        return {}
    hours = {}
    timetable = work_hours.get('timetable') or {}
    day_map = {
        'sunday': 'Sunday', 'monday': 'Monday', 'tuesday': 'Tuesday',
        'wednesday': 'Wednesday', 'thursday': 'Thursday', 'friday': 'Friday',
        'saturday': 'Saturday',
    }
    for day_key, day_label in day_map.items():
        slots = timetable.get(day_key)
        if slots is None:
            hours[day_label] = 'Closed'
        elif slots == []:
            hours[day_label] = 'Open 24 hours'
        else:
            parts = []
            for slot in slots:
                open_h  = slot.get('open', {})
                close_h = slot.get('close', {})
                oh = f"{open_h.get('hour', 0):02d}:{open_h.get('minute', 0):02d}"
                ch = f"{close_h.get('hour', 0):02d}:{close_h.get('minute', 0):02d}"
                parts.append(f'{oh}–{ch}')
            hours[day_label] = ', '.join(parts)
    return hours

def is_car_wash(item):
    """
    Return True if DataForSEO item is a car wash or has a car wash on-site.
    Accepts gas stations / other businesses that have has_car_wash confirmed by Google,
    since many touchless car washes operate at gas station locations.
    """
    category    = (item.get('category') or '').lower()
    add_cats    = [c.lower() for c in (item.get('additional_categories') or [])]
    title       = (item.get('title') or '').lower()
    attrs       = item.get('attributes') or {}
    avail       = attrs.get('available_attributes') or {}
    offerings   = avail.get('offerings', []) if isinstance(avail, dict) else []

    # Primary car wash category
    if 'car wash' in category or 'carwash' in category:
        return True
    # Car wash in additional categories
    if any('car wash' in c or 'carwash' in c for c in add_cats):
        return True
    # Google explicitly confirms a car wash exists on-site (catches gas stations)
    if 'has_car_wash' in offerings:
        return True
    # Name clearly indicates a car wash
    if 'wash' in title and any(kw in title for kw in ['car', 'auto', 'vehicle', 'laser', 'touch']):
        return True
    return False

def enrich_place(pid):
    """
    Call DataForSEO my_business_info/live for one place ID.
    Returns parsed listing dict or None if should be skipped.
    """
    r = dfs_post('/v3/business_data/google/my_business_info/live', [{
        'keyword': f'place_id:{pid}',
        'location_name': 'United States',
        'language_code': 'en',
    }])
    task = r['tasks'][0]
    if task.get('status_code') != 20000:
        raise Exception(f"DFS error {task.get('status_code')}: {task.get('status_message')}")

    result = task.get('result')
    if not result or not result[0].get('items'):
        return None  # place not found

    item = result[0]['items'][0]

    # Skip closed businesses
    if item.get('is_claimed') is False and not item.get('title'):
        return None

    # Filter non-car-washes
    if not is_car_wash(item):
        return None

    title       = item.get('title') or 'Unknown Car Wash'
    address_str = item.get('address') or ''
    addr_info   = item.get('address_info') or {}
    city, state, zip_ = parse_address_info(addr_info)

    # Fall back: try to parse city/state from address string
    if not city and address_str:
        parts = [p.strip() for p in address_str.split(',')]
        if len(parts) >= 3:
            city = parts[-3] if len(parts) >= 3 else ''
            state_zip = parts[-2].strip().split() if len(parts) >= 2 else []
            if state_zip:
                state = state_zip[0]
            if len(state_zip) > 1:
                zip_ = state_zip[1]

    # Must have city + state to be useful
    if not city or not state or len(state) != 2:
        return None

    # Parse street address (everything before the city)
    street = address_str.split(',')[0].strip() if ',' in address_str else address_str

    phone   = item.get('phone') or None
    website = item.get('url') or None
    rating  = (item.get('rating') or {}).get('value') or 0
    review_count = (item.get('rating') or {}).get('votes_count') or 0
    lat     = (item.get('coordinates') or {}).get('latitude') or None
    lng     = (item.get('coordinates') or {}).get('longitude') or None
    description = item.get('description') or None
    category    = item.get('category') or None
    add_cats    = item.get('additional_categories') or []
    price_level = item.get('price_level') or None
    main_image  = upscale_google_photo(item.get('main_image') or None)
    typical_time = item.get('typical_time_spent') or None

    price_range = None
    if price_level:
        mapping = {1: '$', 2: '$$', 3: '$$$', 4: '$$$$'}
        price_range = mapping.get(price_level)

    hours = parse_hours(item.get('work_hours'))

    google_maps_url = None
    links = item.get('local_business_links') or []
    for link in links:
        if 'google.com/maps' in (link.get('url') or ''):
            google_maps_url = link['url']
            break
    if not google_maps_url and lat and lng:
        google_maps_url = f'https://www.google.com/maps/place/?q=place_id:{pid}'

    return {
        'title': title,
        'address': street,
        'city': city,
        'state': state,
        'zip': zip_ or None,
        'phone': phone,
        'website': website,
        'rating': float(rating) if rating else 0,
        'review_count': int(review_count) if review_count else 0,
        'latitude': float(lat) if lat else None,
        'longitude': float(lng) if lng else None,
        'google_description': description,
        'category': category,
        'add_cats': add_cats,
        'price_range': price_range,
        'hours': hours,
        'main_image': main_image,
        'google_maps_url': google_maps_url,
        'typical_time_spent': typical_time,
        'google_place_id': pid,
    }

# ── Phase 1: Enrich & insert ──────────────────────────────────────────────────

def phase1_enrich(place_ids, progress):
    processed_set = set(progress['processed'])
    remaining     = [pid for pid in place_ids if pid not in processed_set]

    log(f'Phase 1: {len(remaining)} Place IDs to enrich ({len(processed_set)} already done)')

    # Pre-load existing slugs to avoid DB round-trips for every slug check
    log('Loading existing slugs from DB...')
    existing_slugs = set()
    offset = 0
    while True:
        rows = sb_get(f'/rest/v1/listings?select=slug&limit=1000&offset={offset}')
        for r in rows:
            if r.get('slug'):
                existing_slugs.add(r['slug'])
        if len(rows) < 1000:
            break
        offset += 1000
    log(f'Loaded {len(existing_slugs)} existing slugs')

    # Pre-check which place IDs already exist in DB (batch of 200)
    log('Checking which Place IDs already exist in DB...')
    already_in_db = set()
    chunk_size = 200
    for i in range(0, len(remaining), chunk_size):
        chunk = remaining[i:i+chunk_size]
        ids_str = ','.join(chunk)
        rows = sb_get(f'/rest/v1/listings?google_place_id=in.({ids_str})&select=google_place_id')
        for row in rows:
            if row.get('google_place_id'):
                already_in_db.add(row['google_place_id'])
    if already_in_db:
        log(f'  {len(already_in_db)} Place IDs already in DB — will skip')

    inserted = 0
    skipped_no_carwash = 0
    skipped_no_data = 0
    skipped_existing = 0
    errors = 0

    for i, pid in enumerate(remaining):
        if pid in already_in_db:
            skipped_existing += 1
            progress['processed'].append(pid)
            progress['skipped'].append({'pid': pid, 'reason': 'already_in_db'})
            if (i + 1) % 100 == 0:
                log(f'  {i+1}/{len(remaining)} | inserted={inserted} skip_existing={skipped_existing} skip_no_wash={skipped_no_carwash} errors={errors}')
            continue

        try:
            data = enrich_place(pid)
        except Exception as e:
            errors += 1
            progress['processed'].append(pid)
            progress['errors'].append({'pid': pid, 'error': str(e)})
            log(f'  ERROR {pid}: {e}')
            if errors % 20 == 0:
                save_progress(progress)
            time.sleep(1)
            continue

        if data is None:
            skipped_no_carwash += 1
            progress['processed'].append(pid)
            progress['skipped'].append({'pid': pid, 'reason': 'no_data_or_not_car_wash'})
            time.sleep(0.15)
            continue

        # Build slug
        slug = make_unique_slug(data['title'], existing_slugs)

        # Determine initial touchless status
        name_is_touchless = bool(TOUCHLESS_NAME_RE.search(data['title']))

        listing = {
            'name':                 data['title'],
            'slug':                 slug,
            'address':              data['address'],
            'city':                 data['city'],
            'state':                data['state'],
            'zip':                  data['zip'] or '',
            'phone':                data['phone'],
            'website':              data['website'],
            'rating':               data['rating'],
            'review_count':         data['review_count'],
            'latitude':             data['latitude'],
            'longitude':            data['longitude'],
            'google_description':   data['google_description'],
            'google_category':      data['category'],
            'google_maps_url':      data['google_maps_url'],
            'google_place_id':      data['google_place_id'],
            'hero_image':           data['main_image'],
            'google_photo_url':     data['main_image'],
            'hours':                data['hours'] or {},
            'wash_packages':        [],
            'amenities':            [],
            'photos':               [data['main_image']] if data['main_image'] else [],
            'price_range':          data['price_range'],
            'typical_time_spent':   data['typical_time_spent'],
            'is_touchless':         None,   # review mining will confirm
            'is_approved':          False,
            'is_featured':          False,
            'review_mine_status':   None,   # queued for mining
            'crawl_status':         'classified',
            'crawl_notes':          f'OpenMart import — pending review verification{"  (name: touchless signal)" if name_is_touchless else ""}',
        }

        try:
            result = sb_post('/rest/v1/listings', listing)
            inserted += 1
            inserted_id = result[0]['id'] if result else None
            progress['processed'].append(pid)
            progress['inserted'].append({'pid': pid, 'id': inserted_id, 'name': data['title'], 'city': data['city'], 'state': data['state']})
        except Exception as e:
            errors += 1
            progress['processed'].append(pid)
            progress['errors'].append({'pid': pid, 'error': f'insert: {e}'})
            log(f'  INSERT ERROR {pid} ({data["title"]}): {e}')

        if (i + 1) % 50 == 0:
            log(f'  {i+1}/{len(remaining)} | inserted={inserted} skip_existing={skipped_existing} skip_no_wash={skipped_no_carwash} errors={errors}')
            save_progress(progress)

        time.sleep(0.15)  # ~6-7 req/s, within rate limits

    save_progress(progress)
    log(f'Phase 1 complete: {inserted} inserted | {skipped_existing} already existed | '
        f'{skipped_no_carwash} not a car wash | {errors} errors')
    return inserted

# ── Phase 2: Review mining ────────────────────────────────────────────────────

def phase2_review_mine():
    log('')
    log('--- Phase 2: Review mining ---')

    batch = 0
    total_scanned = 0
    total_touchless = 0
    consecutive_errors = 0
    start = time.time()

    while True:
        try:
            r = edge_post('review-mine', {
                'action': 'scan_batch',
                'batch_size': 50,
                'all_listings': True,
            })
            scanned   = r.get('scanned_this_batch', 0)
            touchless = r.get('found_touchless', 0)
            complete  = r.get('complete', False)
            batch += 1
            total_scanned   += scanned
            total_touchless += touchless
            consecutive_errors = 0

            if touchless or r.get('ai_rejected', 0):
                for res in r.get('results', []):
                    if res.get('status') == 'touchless_found':
                        log(f'  ✓ {res["name"]} — {res["city"]}, {res["state"]} ({res.get("reviewCount", 0)} snippets)')
                    elif res.get('status') == 'ai_rejected':
                        log(f'  ✗ REJECTED: {res["name"]} — {res["city"]}, {res["state"]}')

            elapsed = int(time.time() - start)
            log(f'Batch {batch}: scanned={scanned} touchless={touchless} total_touchless={total_touchless} ({elapsed}s)')

            if complete or scanned == 0:
                log('Review mining complete.')
                break

            time.sleep(3)

        except Exception as e:
            consecutive_errors += 1
            log(f'ERROR batch {batch}: {e}')
            if consecutive_errors >= 5:
                log('5 consecutive errors — stopping mining phase.')
                break
            time.sleep(10)

    log(f'Phase 2 summary: {total_scanned} scanned | {total_touchless} confirmed touchless')
    return total_touchless

# ── Phase 3: Name-promotion ───────────────────────────────────────────────────

def phase3_name_promote():
    log('')
    log('--- Phase 3: Name-promotion for unconfirmed touchless names ---')

    # Find listings inserted by this import that are still is_touchless=null
    # after review mining (scanned_clean, no evidence)
    rows = sb_get(
        '/rest/v1/listings'
        '?is_touchless=is.null'
        '&review_mine_status=eq.scanned_clean'
        '&crawl_notes=ilike.*OpenMart+import*'
        '&select=id,name,city,state'
        '&limit=2000'
    )

    log(f'Found {len(rows)} OpenMart imports with no review evidence after mining')

    promote = [r for r in rows if TOUCHLESS_NAME_RE.search(r['name'] or '')]
    no_signal = len(rows) - len(promote)

    log(f'  {len(promote)} have touchless name signal → promoting to is_touchless=true')
    log(f'  {no_signal} have no signal at all → leaving as null (not shown in directory)')

    if promote:
        log('Sample promoted:')
        for r in promote[:10]:
            log(f'  ✓ {r["name"]} — {r["city"]}, {r["state"]}')
        if len(promote) > 10:
            log(f'  ... and {len(promote)-10} more')

        # Update in batches of 100
        ids = [r['id'] for r in promote]
        for i in range(0, len(ids), 100):
            chunk = ids[i:i+100]
            ids_sql = ', '.join(f"'{id_}'" for id_ in chunk)
            import subprocess
            sql = f"""UPDATE listings
SET
    is_touchless = true,
    is_approved = true,
    touchless_verified = 'name',
    crawl_notes = crawl_notes || ' — promoted via touchless name signal'
WHERE id IN ({ids_sql})
  AND is_touchless IS NULL;"""
            result = subprocess.run(
                ['npx', 'supabase', 'db', 'query', '--linked', sql],
                capture_output=True, text=True,
                cwd='/Users/michaelgray/Projects/TouchlessCarWash'
            )
            if result.returncode != 0:
                log(f'  Batch promote failed: {result.stderr[:200]}')
            else:
                log(f'  Promoted batch {i//100 + 1}: {len(chunk)} listings')

    return len(promote)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log('=' * 60)
    log('OpenMart import pipeline started')
    log('=' * 60)

    with open(PLACE_IDS_FILE) as f:
        data = json.load(f)
    place_ids = data['net_new_place_ids']
    log(f'Loaded {len(place_ids)} Place IDs from {PLACE_IDS_FILE}')

    progress = load_progress()
    log(f'Progress: {len(progress["processed"])} already processed, '
        f'{len(progress["inserted"])} inserted, '
        f'{len(progress["errors"])} errors')

    # Phase 1
    inserted = phase1_enrich(place_ids, progress)

    if inserted == 0 and len(progress['inserted']) == 0:
        log('No listings inserted — nothing to mine. Exiting.')
        return

    # Phase 2
    confirmed = phase2_review_mine()

    # Phase 3
    promoted = phase3_name_promote()

    # Final summary
    total_inserted = len(progress['inserted'])
    total_skipped  = len(progress['skipped'])
    total_errors   = len(progress['errors'])

    log('')
    log('=' * 60)
    log('IMPORT COMPLETE')
    log(f'  Enriched & inserted:    {total_inserted}')
    log(f'  Skipped (not car wash / already existed): {total_skipped}')
    log(f'  Errors:                 {total_errors}')
    log(f'  Confirmed via reviews:  {confirmed}')
    log(f'  Promoted via name:      {promoted}')
    log(f'  Total new touchless:    {confirmed + promoted}')
    log('=' * 60)

if __name__ == '__main__':
    main()
