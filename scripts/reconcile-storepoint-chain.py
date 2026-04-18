#!/usr/bin/env python3
"""
Generic Storepoint-backed chain reconciler.

Reads chain config (storepoint_id + match criteria) and reconciles the chain's
Storepoint-tagged locations against our DB. Chain-operator tags are trusted as
authoritative.

Actions per location:
  1. Skip if tags indicate non-wash (Market, Gas-only, etc.)
  2. If tagged Touchless (or Touchless & Brush) → ensure in DB as touchless
  3. If tagged other wash type (Tunnel/Brush/Self-Serve) → ensure NOT touchless

Usage:
  python3 scripts/reconcile-storepoint-chain.py --chain=brown-bear [--dry-run] [--insert]
  python3 scripts/reconcile-storepoint-chain.py --chain=max-car-wash [--insert]
"""
import json, sys, os, re, datetime, ssl, urllib.request
from collections import Counter

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
SSL_CTX = ssl.create_default_context(); SSL_CTX.check_hostname = False; SSL_CTX.verify_mode = ssl.CERT_NONE

# Per-chain configuration
CHAINS = {
    'max-car-wash': {
        'storepoint_id': '1631b416ca3f0d',
        'parent_chain': 'Max Car Wash',
        'chain_website': 'https://mcwash.com/',
        # For DB match: any listing matching one of these filters is considered part of this chain
        'db_match_or': ['parent_chain.eq.Max Car Wash', 'website.ilike.%mcwash.com%'],
        # Tags indicating this location has no car wash (skip)
        'non_wash_tags': {'Gas', 'Top Tier Gas', 'Market', 'Store'},
        # Tags indicating touchless (include as touchless)
        'touchless_tags': {'Touchless', 'Touchless & Brush'},
        # Tags indicating non-touchless wash (revert any existing touchless-classified)
        'non_touchless_tags': {'Brush', 'Tunnel', 'Rain Shield', 'Self-Serve'},
    },
    'brown-bear': {
        'storepoint_id': '166ea08f6d3e63',
        'parent_chain': 'Brown Bear',
        'chain_website': 'https://www.brownbear.com/',
        'db_match_or': ['parent_chain.eq.Brown Bear', 'website.ilike.%brownbear.com%', 'name.ilike.%brown bear%'],
        'non_wash_tags': {'Hungry Bear Market', 'Top Tier Gas'},
        'touchless_tags': {'Touchless Car Wash', 'Touchless'},
        'non_touchless_tags': {'Tunnel Car Wash', 'Tunnel', 'Self-Serve Car Wash', 'Self-Serve', 'Brush', 'Brush Car Wash'},
    },
}


def log(m): print(f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {m}', flush=True)


def sb_req(method, path, body=None):
    headers = {'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}', 'Content-Type':'application/json'}
    if method in ('POST', 'PATCH'): headers['Prefer'] = 'return=representation'
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


def fetch_storepoint(spid):
    url = f'https://api.storepoint.co/v1/{spid}/locations'
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        return json.loads(r.read())['results']['locations']


def parse_tags(s):
    return [t.strip() for t in (s or '').split(',') if t.strip()]


def categorize(tags, cfg):
    ts = set(tags)
    if ts & set(cfg['non_wash_tags']): return 'non-wash'
    if ts & set(cfg['touchless_tags']): return 'touchless'
    if ts & set(cfg['non_touchless_tags']): return 'non-touchless'
    return 'unknown'


def slugify(s): return re.sub(r'[^a-z0-9]+','-',(s or '').lower()).strip('-')


def parse_addr(s):
    """'202 164th St SW, Lynnwood, WA 98037, US' -> (street, city, state, zip)"""
    s = (s or '').replace(', US','').replace(', USA','').strip()
    # Try 'street, city, state zip' or 'street, city, zip'
    m = re.match(r'^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5})$', s)
    if m: return m.group(1), m.group(2), m.group(3), m.group(4)
    m = re.match(r'^(.+?),\s*(.+?)\s+(\d{5})$', s)
    if m: return m.group(1), m.group(2), None, m.group(3)
    return (s, None, None, None)


def main():
    chain_key = None
    DRY_RUN = False
    INSERT = False
    for i, a in enumerate(sys.argv[1:], 1):
        if a.startswith('--chain='): chain_key = a.split('=',1)[1]
        elif a == '--chain' and i < len(sys.argv)-1: chain_key = sys.argv[i+1]
        elif a == '--dry-run': DRY_RUN = True
        elif a == '--insert': INSERT = True

    if not chain_key or chain_key not in CHAINS:
        print(f'Usage: --chain=<{"|".join(CHAINS.keys())}>')
        sys.exit(1)
    cfg = CHAINS[chain_key]

    log('=' * 60)
    log(f'STOREPOINT RECONCILE — {cfg["parent_chain"]} — dry={DRY_RUN} insert={INSERT}')
    log('=' * 60)

    locations = fetch_storepoint(cfg['storepoint_id'])
    log(f'Storepoint locations: {len(locations)}')

    # Categorize
    cats = Counter()
    buckets = {'touchless': [], 'non-touchless': [], 'non-wash': [], 'unknown': []}
    for l in locations:
        tags = parse_tags(l.get('tags'))
        c = categorize(tags, cfg)
        cats[c] += 1
        buckets[c].append((l, tags))
    log(f'Categorization: {dict(cats)}')

    # Fetch existing DB listings for this chain (run separate queries per filter, dedup by id)
    import urllib.parse
    existing = []
    seen_ids = set()
    for f in cfg['db_match_or']:
        # Each f is a PostgREST filter like "parent_chain.eq.Brown Bear"
        col, op, val = f.split('.', 2)
        q = f'/rest/v1/listings?select=id,name,address,city,state,latitude,longitude,is_touchless,is_approved,website&{col}={op}.{urllib.parse.quote(val)}&limit=2000'
        try:
            rows = sb_req('GET', q) or []
            for r in rows:
                if r['id'] not in seen_ids:
                    seen_ids.add(r['id'])
                    existing.append(r)
        except Exception as e:
            log(f'  query failed for filter {f}: {e}')
    log(f'Existing in DB matching chain: {len(existing)}')

    def find_match(loc):
        lat = loc.get('loc_lat'); lng = loc.get('loc_long')
        if lat is None: return None
        for e in existing or []:
            if e.get('latitude') is None: continue
            if abs(float(e['latitude']) - lat) < 0.0015 and abs(float(e['longitude']) - lng) < 0.0015:
                return e
        return None

    today = datetime.date.today().isoformat()

    # ============ Plan actions ============
    to_insert = []  # touchless locs missing from DB
    to_revert = []  # non-touchless locs currently in DB as touchless
    to_restore = []  # touchless locs currently in DB as non-touchless
    to_keep = []
    to_skip_non_wash = []

    for l, tags in buckets['touchless']:
        m = find_match(l)
        if m:
            if m['is_touchless']: to_keep.append((l, tags, m))
            else: to_restore.append((l, tags, m))
        else:
            to_insert.append((l, tags))

    for l, tags in buckets['non-touchless']:
        m = find_match(l)
        if m and m['is_touchless']:
            to_revert.append((l, tags, m))

    for l, tags in buckets['non-wash']:
        m = find_match(l)
        if m and m['is_touchless']:
            to_skip_non_wash.append((l, tags, m))

    log(f'\nPlanned actions:')
    log(f'  INSERT new touchless:           {len(to_insert)}')
    log(f'  REVERT (chain says not-TL):     {len(to_revert)}')
    log(f'  REVERT (non-wash, e.g. gas):    {len(to_skip_non_wash)}')
    log(f'  RESTORE (was wrongly reverted): {len(to_restore)}')
    log(f'  KEEP (already correct):         {len(to_keep)}')

    if to_insert:
        log(f'\nSample INSERT touchless:')
        for l, tags in to_insert[:8]:
            log(f'  [{tags}] {l["name"]}: {l["streetaddress"]}')

    if to_revert:
        log(f'\nSample REVERT (chain says not-TL):')
        for l, tags, m in to_revert[:10]:
            log(f'  [{tags}] {m["name"]} @ {m.get("address","")} (our id={m["id"][:8]}, approved={m["is_approved"]})')

    if to_skip_non_wash:
        log(f'\nSample non-wash REVERT:')
        for l, tags, m in to_skip_non_wash[:5]:
            log(f'  [{tags}] {m["name"]}')

    if DRY_RUN or not INSERT:
        log('\n(Not executing — add --insert to apply.)')
        return

    # ============ Execute ============
    rev_n = 0
    for l, tags, m in to_revert + to_skip_non_wash:
        reason = f'chain tags as "{", ".join(tags)}" (not touchless)' if tags else 'chain removed or non-wash'
        body = {
            'is_touchless': False, 'is_approved': False, 'touchless_verified': None,
            'hero_image': None, 'hero_image_source': None,
            'crawl_notes': f'[{today}] REVERTED — {cfg["parent_chain"]} Storepoint API {reason}. Chain operator classification is authoritative.'
        }
        try:
            sb_req('PATCH', f'/rest/v1/listings?id=eq.{m["id"]}', body=body)
            rev_n += 1
        except Exception as e:
            log(f'  ❌ revert failed for {m["name"]}: {e}')
    log(f'\nReverted: {rev_n}')

    res_n = 0
    for l, tags, m in to_restore:
        body = {
            'is_touchless': True,
            'touchless_verified': 'chain',
            'parent_chain': cfg['parent_chain'],
            'crawl_notes': f'[{today}] Restored — {cfg["parent_chain"]} Storepoint tags "{", ".join(tags)}" (touchless).'
        }
        try:
            sb_req('PATCH', f'/rest/v1/listings?id=eq.{m["id"]}', body=body)
            res_n += 1
        except Exception as e:
            log(f'  ❌ restore failed: {e}')
    log(f'Restored: {res_n}')

    ins_n = 0
    for l, tags in to_insert:
        street, city, state, zipc = parse_addr(l.get('streetaddress'))
        name = l['name']
        # For Brown Bear locations, append the descriptor if available
        desc = l.get('description') or ''
        if desc and desc not in name: name = f'{name} — {desc}'
        slug = f'{slugify(name)}-{slugify(street)}-{slugify(city)}-{(state or "").lower()}-{zipc or ""}'.strip('-')[:200]
        body = [{
            'name': name,
            'address': f"{street}, {city}, {state or ''} {zipc or ''}".strip(' ,'),
            'city': city, 'state': state, 'zip': zipc,
            'phone': (l.get('phone') or '').strip(),
            'latitude': l.get('loc_lat'),
            'longitude': l.get('loc_long'),
            'website': l.get('website') or cfg['chain_website'],
            'parent_chain': cfg['parent_chain'],
            'is_touchless': True, 'is_approved': False,
            'touchless_verified': 'chain',
            'slug': slug,
            'crawl_notes': f'[{today}] Discovered via {cfg["parent_chain"]} Storepoint API (tags: "{", ".join(tags)}"). Held pending hero/enrichment.',
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }]
        try:
            sb_req('POST', '/rest/v1/listings', body=body)
            ins_n += 1
        except Exception as e:
            log(f'  ❌ insert failed for {name}: {str(e)[:200]}')
    log(f'Inserted: {ins_n}')

    log('\n' + '=' * 60)
    log(f'DONE: reverted={rev_n} restored={res_n} inserted={ins_n}')


if __name__ == '__main__':
    main()
