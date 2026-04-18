#!/usr/bin/env python3
"""
Max Car Wash (mcwash.com) reconciliation via Storepoint API.

The chain explicitly tags each location with wash type (Touchless/Brush/Tunnel/
Rain Shield) via the Storepoint locator at api.storepoint.co/v1/1631b416ca3f0d.
This is authoritative — chain-operator classified.

Actions:
  1. Fetch all 54 Max Car Wash locations from Storepoint
  2. For each with 'Touchless' tag:
     - If already in DB as touchless: confirm + keep
     - If missing from DB: INSERT as touchless + held
  3. For each WITHOUT 'Touchless' tag (Brush/Tunnel/etc):
     - If in DB as touchless: REVERT (chain says it's not)
     - If missing: ignore

Zero API cost — pure HTTP to Storepoint.

Usage: python3 scripts/reconcile-maxcarwash.py [--dry-run] [--insert]
"""
import json, sys, os, re, datetime, ssl, urllib.request

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
SSL_CTX = ssl.create_default_context(); SSL_CTX.check_hostname = False; SSL_CTX.verify_mode = ssl.CERT_NONE

STOREPOINT_ID = '1631b416ca3f0d'
PARENT_CHAIN = 'Max Car Wash'
CHAIN_WEBSITE = 'https://mcwash.com/'

DRY_RUN = '--dry-run' in sys.argv
INSERT = '--insert' in sys.argv


def log(m): print(f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {m}', flush=True)


def sb_req(method, path, body=None):
    headers = {'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}', 'Content-Type':'application/json'}
    if method in ('POST','PATCH'): headers['Prefer'] = 'return=representation'
    req = urllib.request.Request(f'{SUPABASE_URL}{path}',
        data=json.dumps(body).encode() if body else None, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        raw = r.read()
        if not raw: return None
        return json.loads(raw)


def fetch_locations():
    url = f'https://api.storepoint.co/v1/{STOREPOINT_ID}/locations'
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        d = json.loads(r.read())
    return d['results']['locations']


def parse_tags(tags_str):
    return [t.strip() for t in (tags_str or '').split(',') if t.strip()]


def is_touchless(tags):
    return 'Touchless' in tags or 'Touchless & Brush' in tags


def main():
    log('=' * 60)
    log(f'MAX CAR WASH RECONCILE (Storepoint) — dry_run={DRY_RUN} insert={INSERT}')
    log('=' * 60)

    locations = fetch_locations()
    log(f'Total locations from Storepoint: {len(locations)}')

    touchless = [l for l in locations if is_touchless(parse_tags(l.get('tags')))]
    not_touchless = [l for l in locations if not is_touchless(parse_tags(l.get('tags')))]
    log(f'  Touchless-tagged: {len(touchless)}')
    log(f'  Not-touchless-tagged: {len(not_touchless)}')

    # Fetch existing Max Car Wash listings from our DB
    existing = sb_req('GET', f'/rest/v1/listings?select=id,name,address,city,state,latitude,longitude,is_touchless,is_approved&or=(parent_chain.eq.Max%20Car%20Wash,website.ilike.*mcwash.com*,name.ilike.*max%20car%20wash*)&limit=500')
    log(f'\nExisting in DB matching Max Car Wash: {len(existing) if existing else 0}')

    # Match by coords (within 100m ~ 0.0015 degrees)
    def find_match(l):
        lat = l.get('loc_lat'); lng = l.get('loc_long')
        if lat is None: return None
        for e in existing or []:
            if e.get('latitude') is None: continue
            if abs(float(e['latitude']) - lat) < 0.0015 and abs(float(e['longitude']) - lng) < 0.0015:
                return e
        return None

    to_insert = []; to_revert = []; to_confirm = []
    for l in touchless:
        match = find_match(l)
        if match:
            if match['is_touchless'] and match['is_approved']:
                to_confirm.append((l, match))
            elif match['is_touchless'] and not match['is_approved']:
                to_confirm.append((l, match))  # held but correctly classified
            else:
                # was not_touchless or reverted, but chain says touchless
                to_confirm.append((l, match))  # we'll re-promote
        else:
            to_insert.append(l)

    for l in not_touchless:
        match = find_match(l)
        if match and match['is_touchless']:
            to_revert.append((l, match))

    log(f'\nPlanned actions:')
    log(f'  Touchless locations to INSERT: {len(to_insert)}')
    log(f'  Listings to REVERT (chain says not-touchless): {len(to_revert)}')
    log(f'  Matched touchless already correct: {sum(1 for l,m in to_confirm if m["is_touchless"])}')

    log(f'\n--- Touchless to INSERT ---')
    for l in to_insert[:20]:
        tags = l.get('tags')
        log(f'  [{tags}] {l["name"]}: {l["streetaddress"]}')

    log(f'\n--- Listings to REVERT ---')
    for l, m in to_revert:
        tags = l.get('tags')
        log(f'  [{tags}] {m["name"]}: {m["address"]} (our id={m["id"][:8]})')

    if DRY_RUN or not INSERT:
        log('\n(Not executing — pass --insert to apply.)')
        return

    today = datetime.date.today().isoformat()

    # REVERT first
    rev_ok = 0
    for l, m in to_revert:
        tags = l.get('tags')
        body = {
            'is_touchless': False, 'is_approved': False, 'touchless_verified': None,
            'hero_image': None, 'hero_image_source': None,
            'crawl_notes': f'[{today}] REVERTED — mcwash.com chain locator tags this location as "{tags}" (not touchless). Chain operator classification is authoritative.'
        }
        try:
            sb_req('PATCH', f'/rest/v1/listings?id=eq.{m["id"]}', body=body)
            rev_ok += 1
        except Exception as e:
            log(f'  ❌ revert failed for {m["name"]}: {e}')

    log(f'\nReverted: {rev_ok}')

    # INSERT missing touchless
    def slugify(s): return re.sub(r'[^a-z0-9]+','-',(s or '').lower()).strip('-')

    def parse_addr(s):
        """'4449 N SR 7, Lauderdale Lakes 33319' -> (street, city, state, zip)"""
        # Try to match "Street, City ZIP" or "Street, City, ST ZIP"
        m = re.match(r'^(.+?),\s*(.+?)\s+(\d{5})$', (s or '').strip())
        if m:
            street = m.group(1); city = m.group(2); zipc = m.group(3)
            # Florida locations; state inferred from zip or known (most FL)
            return street, city, 'FL', zipc
        return (s, None, None, None)

    ins_ok = 0
    for l in to_insert:
        street, city, state, zipc = parse_addr(l.get('streetaddress'))
        name = l['name']
        slug = f"{slugify(name)}-{slugify(street)}-{slugify(city)}-{(state or '').lower()}-{zipc or ''}".strip('-')[:200]
        addr_full = f"{street}, {city}, {state} {zipc}".strip(', ')
        tags = l.get('tags')
        body = [{
            'name': f'{name} (Max Car Wash)',
            'address': addr_full,
            'city': city, 'state': state, 'zip': zipc,
            'phone': (l.get('phone') or '').strip(),
            'latitude': l.get('loc_lat'),
            'longitude': l.get('loc_long'),
            'website': CHAIN_WEBSITE,
            'parent_chain': PARENT_CHAIN,
            'is_touchless': True, 'is_approved': False,
            'touchless_verified': 'chain',
            'slug': slug,
            'crawl_notes': f'[{today}] Discovered via mcwash.com Storepoint API. Tags: "{tags}". Chain explicitly tags this location as touchless. Held pending hero/enrichment.',
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }]
        try:
            sb_req('POST', '/rest/v1/listings', body=body)
            ins_ok += 1
        except Exception as e:
            log(f'  ❌ insert failed for {name}: {str(e)[:250]}')

    log(f'Inserted: {ins_ok}')

    # Re-approve any confirmed touchless that got stuck
    reap = 0
    for l, m in to_confirm:
        if not m['is_touchless']:
            # We'd previously reverted it; chain says it's touchless. Restore.
            tags = l.get('tags')
            body = {
                'is_touchless': True,
                'touchless_verified': 'chain',
                'parent_chain': PARENT_CHAIN,
                'crawl_notes': f'[{today}] Restored — mcwash.com chain tags this location as "{tags}" (touchless).'
            }
            try:
                sb_req('PATCH', f'/rest/v1/listings?id=eq.{m["id"]}', body=body)
                reap += 1
            except Exception: pass
    log(f'Restored (previously wrongly reverted): {reap}')


if __name__ == '__main__':
    main()
