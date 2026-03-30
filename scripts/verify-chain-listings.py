#!/usr/bin/env python3
"""
Verify the 1,105 chain-classified touchless listings using two independent sources:

1. DataForSEO my_business_info — confirms whether Google shows 'has_car_wash'
   attribute, and whether the category is 'Car wash' (not just gas station).
2. OpenMart cross-reference — confirms whether the listing appears in OpenMart's
   'touchless car wash' results (independent corroboration).

Outputs a summary and saves detailed results to scripts/chain-verify-results.json.
"""
import json, ssl, urllib.request, time, datetime, os

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

DATAFORSEO_KEY = 'bWljaGFlbEB0b3VjaGxlc3NjYXJ3YXNoZmluZGVyLmNvbTo0ZTQyOWQxMjdhOTExZDdh'
OPENMART_KEY   = 'FG3HdmtmpTAPwj8AXE_ZD7BFxdvMakFP2xDPsLV92YU'
SUPABASE_URL   = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

LOG_FILE     = os.path.join(os.path.dirname(__file__), 'chain-verify-results.log')
RESULTS_FILE = os.path.join(os.path.dirname(__file__), 'chain-verify-results.json')

def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

def dfs_post(path, body):
    req = urllib.request.Request(f'https://api.dataforseo.com{path}',
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json',
                 'Authorization': f'Basic {DATAFORSEO_KEY}'})
    with urllib.request.urlopen(req, timeout=60, context=ssl_ctx) as r:
        return json.loads(r.read())

def openmart_post(path, body):
    req = urllib.request.Request(f'https://api.openmart.ai{path}',
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json',
                 'Authorization': f'Bearer {OPENMART_KEY}'})
    with urllib.request.urlopen(req, timeout=60, context=ssl_ctx) as r:
        return json.loads(r.read())

def sb_get(path):
    req = urllib.request.Request(f'{SUPABASE_URL}{path}',
        headers={'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}'})
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())

# ── Step 1: Fetch all chain-classified listings from DB ──────────────────────
log('=' * 60)
log('Chain listing verification started')
log('=' * 60)

log('Fetching chain-classified listings from DB...')
all_listings = []
offset = 0
while True:
    batch = sb_get(
        f'/rest/v1/listings'
        f'?is_touchless=eq.true'
        f'&crawl_status=eq.classified'
        f'&crawl_notes=ilike.*Chain+rule*'
        f'&select=id,name,city,state,google_place_id,crawl_notes'
        f'&limit=500&offset={offset}'
    )
    if not batch:
        break
    all_listings.extend(batch)
    if len(batch) < 500:
        break
    offset += 500

log(f'Found {len(all_listings)} chain-classified listings')

# ── Step 2: OpenMart cross-reference ────────────────────────────────────────
log('')
log('--- Step 2: OpenMart cross-reference ---')
log('Fetching OpenMart touchless car wash IDs (up to 7,000)...')

chain_place_ids = {l['google_place_id'] for l in all_listings if l.get('google_place_id')}
openmart_touchless_ids = set()
cursor = None
page = 0

while page < 7:
    body = {'query': 'touchless car wash', 'country': 'US', 'limit': 1000}
    if cursor:
        body['cursor'] = cursor
    records = openmart_post('/api/v1/search/only_ids', body)
    records = records if isinstance(records, list) else records.get('data', [])
    if not records:
        break
    for rec in records:
        if rec.get('place_id'):
            openmart_touchless_ids.add(rec['place_id'])
    cursor = records[-1].get('cursor') if records else None
    page += 1
    last_score = records[-1].get('match_score', 0) if records else 0
    matches_this_page = sum(1 for r in records if r.get('place_id') in chain_place_ids)
    log(f'  Page {page}: {len(records)} IDs | {matches_this_page} match chain listings | score: {last_score:.1f}')
    if not cursor or last_score < 150:
        break
    time.sleep(0.3)

openmart_confirmed = chain_place_ids & openmart_touchless_ids
log(f'OpenMart confirms {len(openmart_confirmed)} of {len(chain_place_ids)} chain listings as touchless')

# ── Step 3: DataForSEO my_business_info ─────────────────────────────────────
log('')
log('--- Step 3: DataForSEO my_business_info ---')
log(f'Fetching Google Business attributes for all {len(all_listings)} listings...')

dfs_results = {}
listings_with_pid = [l for l in all_listings if l.get('google_place_id')]
total = len(listings_with_pid)

# Live endpoint only reliably returns one result per request — send individually
for i, listing in enumerate(listings_with_pid):
    pid = listing['google_place_id']
    try:
        r = dfs_post('/v3/business_data/google/my_business_info/live', [{
            'keyword': f'place_id:{pid}',
            'location_name': 'United States',
            'language_code': 'en'
        }])
        task = r['tasks'][0]
        item = {}
        if task.get('result') and task['result'][0].get('items'):
            item = task['result'][0]['items'][0]
        attrs  = item.get('attributes') or {}
        avail  = attrs.get('available_attributes') or {}
        offerings = avail.get('offerings', []) if isinstance(avail, dict) else []
        category  = item.get('category', '') or ''
        add_cats  = item.get('additional_categories') or []

        has_car_wash_attr = 'has_car_wash' in offerings
        is_car_wash_cat   = 'car wash' in category.lower()
        car_wash_in_cats  = any('car wash' in (c or '').lower() for c in add_cats)
        google_says_wash  = has_car_wash_attr or is_car_wash_cat or car_wash_in_cats

        dfs_results[pid] = {
            'listing_id':        listing['id'],
            'name':              listing['name'],
            'city':              listing['city'],
            'state':             listing['state'],
            'google_place_id':   pid,
            'crawl_notes':       listing['crawl_notes'],
            'google_category':   category,
            'google_add_cats':   add_cats,
            'has_car_wash_attr': has_car_wash_attr,
            'is_car_wash_cat':   is_car_wash_cat,
            'google_says_wash':  google_says_wash,
            'in_openmart':       pid in openmart_touchless_ids,
            'offerings':         offerings,
            'all_attributes':    avail,
        }
    except Exception as e:
        dfs_results[pid] = {'error': str(e), 'name': listing['name'],
                            'listing_id': listing['id'], 'google_place_id': pid}

    if (i + 1) % 100 == 0 or (i + 1) == total:
        has_wash = sum(1 for v in dfs_results.values() if v.get('google_says_wash'))
        in_om    = sum(1 for v in dfs_results.values() if v.get('in_openmart'))
        errs     = sum(1 for v in dfs_results.values() if v.get('error'))
        log(f'  {i+1}/{total} | google_says_wash: {has_wash} | in_openmart: {in_om} | errors: {errs}')
    time.sleep(0.15)  # ~6-7 req/s, well within rate limits

# ── Step 4: Summarise ────────────────────────────────────────────────────────
log('')
log('=' * 60)
log('VERIFICATION RESULTS')
log('=' * 60)

results = list(dfs_results.values())
total        = len(results)
google_wash  = [r for r in results if r.get('google_says_wash')]
in_openmart  = [r for r in results if r.get('in_openmart')]
both         = [r for r in results if r.get('google_says_wash') and r.get('in_openmart')]
neither      = [r for r in results if not r.get('google_says_wash') and not r.get('in_openmart') and not r.get('error')]
google_only  = [r for r in results if r.get('google_says_wash') and not r.get('in_openmart')]
openmart_only= [r for r in results if not r.get('google_says_wash') and r.get('in_openmart')]
errors       = [r for r in results if r.get('error')]

log(f'Total chain-classified:        {total}')
log(f'')
log(f'✅ Confirmed by BOTH sources:   {len(both)}  ({100*len(both)//total}%)')
log(f'✅ Google only (has_car_wash):  {len(google_only)}  ({100*len(google_only)//total}%)')
log(f'✅ OpenMart only:               {len(openmart_only)}  ({100*len(openmart_only)//total}%)')
log(f'❌ Confirmed by NEITHER:        {len(neither)}  ({100*len(neither)//total}%)')
log(f'⚠️  Errors:                     {len(errors)}')
log(f'')
log(f'Total with at least 1 signal:  {len(both)+len(google_only)+len(openmart_only)}  ({100*(len(both)+len(google_only)+len(openmart_only))//total}%)')

log('')
log('--- Sample "neither" listings (potential false positives) ---')
for r in neither[:15]:
    log(f'  {r["name"]} — {r["city"]}, {r["state"]} | cat: {r.get("google_category")} | '
        f'offerings: {r.get("offerings")}')

# Save full results
with open(RESULTS_FILE, 'w') as f:
    json.dump({
        'generated_at': str(datetime.datetime.now()),
        'summary': {
            'total': total,
            'both_sources': len(both),
            'google_only': len(google_only),
            'openmart_only': len(openmart_only),
            'neither': len(neither),
            'errors': len(errors),
        },
        'neither_ids': [r['listing_id'] for r in neither],
        'all_results': results,
    }, f, indent=2)

log(f'Full results saved to: {RESULTS_FILE}')
