#!/usr/bin/env python3
"""
Circle K review miner — classify Circle K-branded car wash locations as
touchless/tunnel by scraping Google Maps reviews for each.

Input: scripts/discovery-output/circlek-stores.json (from grid scan)
Filter: display_brand='Circle K' AND services has car_wash
        AND NOT in rainstorm_car_wash / car_wash_cleanfreak sub-brands

For each candidate:
  1. Search Google Maps for "Circle K {address} {city}" via Crawl4AI
  2. Extract page markdown (includes visible review text)
  3. Count touchless vs contra keyword mentions
  4. Classify:
     - strong touchless signal, no contra → mark touchless
     - strong contra signal → mark tunnel (skip — don't add to DB)
     - mixed/weak → held for now (don't insert)

Only INSERT as touchless if confidence is high.

Usage: python3 scripts/mine-circlek-reviews.py [--limit N] [--dry-run] [--insert]
"""
import asyncio, json, os, re, ssl, urllib.request, datetime, sys
from urllib.parse import quote
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
SSL_CTX = ssl.create_default_context(); SSL_CTX.check_hostname=False; SSL_CTX.verify_mode=ssl.CERT_NONE

SCRIPT_DIR = os.path.dirname(__file__)
OUT_FILE = os.path.join(SCRIPT_DIR, 'discovery-output', 'circlek-review-results.json')
LOG_FILE = os.path.join(SCRIPT_DIR, 'mine-circlek-reviews.log')

LIMIT = 0
DRY_RUN = False
INSERT = False

for i, a in enumerate(sys.argv[1:], 1):
    if a == '--limit' and i < len(sys.argv)-1: LIMIT = int(sys.argv[i+1])
    elif a.startswith('--limit='): LIMIT = int(a.split('=')[1])
    elif a == '--dry-run': DRY_RUN = True
    elif a == '--insert': INSERT = True


def log(m):
    line = f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {m}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f: f.write(line + '\n')


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
        body = e.read().decode('utf-8', errors='replace')[:300]
        raise Exception(f'HTTP {e.code}: {body}')


def slugify(s): return re.sub(r'[^a-z0-9]+','-',(s or '').lower()).strip('-')


# Reuse STATE_BOXES from Holiday reconciler
STATE_BOXES = [
    ('MN', 43.50, 49.40, -97.25, -89.48), ('WI', 42.50, 47.10, -92.90, -86.75),
    ('IA', 40.38, 43.50, -96.65, -90.14), ('ND', 45.94, 49.00, -104.05, -96.55),
    ('SD', 42.48, 45.95, -104.06, -96.44), ('MI', 41.70, 48.30, -90.42, -82.12),
    ('IL', 36.97, 42.51, -91.51, -87.02), ('OH', 38.40, 42.33, -84.82, -80.52),
    ('IN', 37.77, 41.77, -88.10, -84.78), ('MO', 35.99, 40.62, -95.77, -89.10),
    ('KS', 36.99, 40.01, -102.05, -94.59), ('NE', 39.99, 43.00, -104.05, -95.31),
    ('CO', 36.99, 41.00, -109.06, -102.04), ('WY', 40.99, 45.00, -111.06, -104.05),
    ('MT', 44.99, 49.00, -116.05, -104.04), ('AZ', 31.33, 37.00, -114.82, -109.04),
    ('CA', 32.53, 42.01, -124.41, -114.13), ('NY', 40.49, 45.02, -79.76, -71.85),
    ('PA', 39.72, 42.27, -80.52, -74.69), ('FL', 24.52, 31.00, -87.63, -80.03),
    ('GA', 30.36, 35.00, -85.61, -80.84), ('SC', 32.03, 35.22, -83.35, -78.54),
    ('NC', 33.85, 36.59, -84.32, -75.46), ('TX', 25.84, 36.50, -106.65, -93.51),
    ('LA', 28.93, 33.02, -94.04, -88.82), ('TN', 34.98, 36.68, -90.31, -81.65),
    ('KY', 36.50, 39.15, -89.57, -81.97), ('VA', 36.54, 39.47, -83.68, -75.24),
    ('WA', 45.54, 49.00, -124.85, -116.92), ('OR', 41.99, 46.29, -124.70, -116.46),
    ('ID', 41.99, 49.00, -117.24, -111.04), ('NV', 35.00, 42.00, -120.00, -114.04),
    ('NM', 31.33, 37.00, -109.05, -103.00), ('UT', 37.00, 42.00, -114.05, -109.04),
    ('OK', 33.62, 37.00, -103.00, -94.43), ('AR', 33.00, 36.50, -94.62, -89.64),
    ('MS', 30.17, 35.00, -91.65, -88.10), ('AL', 30.20, 35.01, -88.47, -84.89),
]


def state_from_coords(lat, lng):
    for name, lat_lo, lat_hi, lng_lo, lng_hi in STATE_BOXES:
        if lat_lo <= lat <= lat_hi and lng_lo <= lng <= lng_hi:
            return name
    return None


# ============ Evidence patterns ============

POSITIVE_RE = re.compile(
    r'\btouch[- ]?(less|free)\b|\bbrushless\b|\blaser\s*wash\b|\bno\s+brush(es)?\b|\bno touch\b|\b(PDQ|Mark\s*VII|WashTec|Istobal)\b',
    re.I
)

CONTRA_RE = re.compile(
    r'\b(soft[- ]?cloth|rotating\s+brush|spinning\s+brush|mitter\s+curtain|foam\s+(wrap|brush|curtain)|conveyor\s+(tunnel|belt)|hand[- ]?wash|attendant\s+dri|tunnel\s+wash|soft[- ]?touch)\b',
    re.I
)

NEGATION_RE = re.compile(
    r"\b(isn['\u2019]?t|not\s+(a\s+)?(touch[- ]?(less|free)|brushless)|advertis(ed|es)\s+as\s+touch|claims\s+to\s+be\s+touch|but\s+uses\s+(brush|cloth|foam))",
    re.I
)


def score_text(text):
    """Return dict with counts and verdict."""
    if not text: return {'pos': 0, 'neg': 0, 'verdict': 'no-data'}
    # Cap at 50k chars
    text = text[:50000]
    pos_matches = POSITIVE_RE.findall(text)
    neg_matches = CONTRA_RE.findall(text)
    # Deduct for negation near positive matches
    neg_pos_count = 0
    for m in POSITIVE_RE.finditer(text):
        ctx = text[max(0, m.start()-80):m.end()+20]
        if NEGATION_RE.search(ctx): neg_pos_count += 1
    pos = len(pos_matches) - neg_pos_count
    neg = len(neg_matches)
    if pos >= 2 and neg == 0: verdict = 'touchless'
    elif pos >= 3 and neg <= 1: verdict = 'touchless'
    elif neg >= 3: verdict = 'tunnel'
    elif neg >= 2 and pos == 0: verdict = 'tunnel'
    else: verdict = 'unclear'
    return {'pos': pos, 'neg': neg, 'verdict': verdict}


async def scrape_store(crawler, store):
    """Scrape Google Maps for this Circle K store, return review markdown."""
    addr = store.get('address') or ''
    city = (store.get('city') or '').title()
    query = f'Circle K {addr} {city}'
    url = f'https://www.google.com/maps/search/{quote(query)}'
    try:
        r = await crawler.arun(url, config=CrawlerRunConfig(
            page_timeout=25000, delay_before_return_html=3.0,
            simulate_user=True, override_navigator=True, magic=True,
            cache_mode=CacheMode.BYPASS, verbose=False,
        ))
        if not r or not r.success: return ''
        return (r.markdown or '')[:30000]
    except Exception:
        return ''


async def main():
    log('=' * 60)
    log(f'CIRCLE K REVIEW MINER — limit={LIMIT} dry_run={DRY_RUN} insert={INSERT}')
    log('=' * 60)

    # Load candidates
    path = os.path.join(SCRIPT_DIR, 'discovery-output', 'circlek-stores.json')
    with open(path) as f: data = json.load(f)

    candidates = []
    for sid, s in data.items():
        if s.get('display_brand') != 'Circle K': continue
        services = [(sv.get('name') if isinstance(sv, dict) else str(sv)) for sv in (s.get('services') or [])]
        if 'car_wash' not in services: continue
        # Skip explicit tunnel sub-brands
        if 'rainstorm_car_wash' in services or 'car_wash_cleanfreak' in services: continue
        candidates.append(s)
    log(f'Candidates (Circle K + car_wash + not tunnel sub-brand): {len(candidates)}')

    # Dedup against existing DB listings by coords
    existing = []
    offset = 0
    while True:
        rows = sb_req('GET', f'/rest/v1/listings?select=id,latitude,longitude&or=(name.ilike.*circle%20k*,website.ilike.*circlek.com*)&limit=2000&offset={offset}')
        if not rows: break
        existing.extend(rows)
        if len(rows) < 2000: break
        offset += 2000
    log(f'Existing Circle K listings in DB: {len(existing)}')

    def already_in_db(store):
        lat = float(store.get('latitude', 0))
        lng = float(store.get('longitude', 0))
        if not lat: return False
        for e in existing:
            if e.get('latitude') is None: continue
            if abs(float(e['latitude']) - lat) < 0.0015 and abs(float(e['longitude']) - lng) < 0.0015:
                return True
        return False

    candidates = [c for c in candidates if not already_in_db(c)]
    log(f'After DB dedup: {len(candidates)}')

    if LIMIT > 0: candidates = candidates[:LIMIT]
    log(f'Processing {len(candidates)}')

    browser_cfg = BrowserConfig(headless=True, java_script_enabled=True, ignore_https_errors=True, verbose=False)
    results = []
    stats = {'touchless': 0, 'tunnel': 0, 'unclear': 0, 'no-data': 0}

    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        for idx, s in enumerate(candidates):
            md = await scrape_store(crawler, s)
            score = score_text(md)
            stats[score['verdict']] = stats.get(score['verdict'], 0) + 1
            result = {'store': s, 'md_len': len(md), **score}
            results.append(result)
            if idx % 10 == 0 and idx > 0:
                log(f'  {idx}/{len(candidates)} TL={stats["touchless"]} tunnel={stats["tunnel"]} unclear={stats["unclear"]} no-data={stats["no-data"]}')
            await asyncio.sleep(1.5)  # polite

    # Save results
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    log(f'\nWrote {OUT_FILE}')
    log(f'Final: touchless={stats["touchless"]} tunnel={stats["tunnel"]} unclear={stats["unclear"]} no-data={stats["no-data"]}')

    if not INSERT:
        log('(not inserting — add --insert to apply.)')
        # Show sample touchless
        touchless_results = [r for r in results if r['verdict'] == 'touchless']
        log(f'\nSample touchless Circle Ks ({len(touchless_results)}):')
        for r in touchless_results[:10]:
            s = r['store']
            log(f'  pos={r["pos"]} neg={r["neg"]} | {s.get("city")}, {s.get("address")}')
        return

    # Insert touchless verdicts
    today = datetime.date.today().isoformat()
    ok = 0; err = 0
    for r in results:
        if r['verdict'] != 'touchless': continue
        s = r['store']
        lat = float(s.get('latitude', 0)) or None
        lng = float(s.get('longitude', 0)) or None
        state = state_from_coords(lat, lng) if lat else None
        if not state: continue
        url_path = s.get('url') or ''
        slug = f'circle-k-{slugify(s.get("city"))}-{slugify(s.get("address"))}-{state.lower()}-{s.get("cost_center","")}'[:200]
        body = [{
            'name': 'Circle K',
            'address': s.get('address'),
            'city': (s.get('city') or '').title(),
            'state': state,
            'zip': '00000',
            'latitude': lat, 'longitude': lng,
            'website': f'https://www.circlek.com{url_path}' if url_path else 'https://www.circlek.com/',
            'parent_chain': 'Circle K',
            'is_touchless': True, 'is_approved': False,
            'touchless_verified': 'user_review',
            'slug': slug,
            'crawl_notes': f'[{today}] Discovered via Circle K stores_master.php + Google Maps review mining (pos={r["pos"]} neg={r["neg"]}). Held pending hero/enrichment.',
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }]
        try:
            sb_req('POST', '/rest/v1/listings', body=body)
            ok += 1
        except Exception as e:
            err += 1

    log(f'\nInserted touchless: {ok}  errors: {err}')


if __name__ == '__main__':
    asyncio.run(main())
