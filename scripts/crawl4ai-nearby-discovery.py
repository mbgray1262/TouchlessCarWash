#!/usr/bin/env python3
"""
Discover new touchless car wash candidates by crawling Google Maps and
extracting "nearby car washes" that we don't already have in our DB.

For each of our approved touchless listings (seeds), visit their Google
Maps place page and collect place_ids from embedded "Similar places" /
"People also viewed" / nearby recommendations. These are cheap candidates
that can be classified in a future pass.

Output: scripts/discovery-output/nearby-candidates.json — a list of
candidate place_ids + any name/address we could extract, deduped against
the current DB's google_place_id set.

Run: python3 scripts/crawl4ai-nearby-discovery.py [--limit N] [--skip N]
"""
import asyncio, json, re, ssl, urllib.request, sys, os, datetime
from urllib.parse import quote

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'crawl4ai-nearby-discovery.log')
OUT_FILE = os.path.join(SCRIPT_DIR, 'discovery-output', 'nearby-candidates.json')

LIMIT = 0
SKIP = 0
for arg in sys.argv[1:]:
    if arg.startswith('--limit='):
        LIMIT = int(arg.split('=')[1])
    elif arg.startswith('--skip='):
        SKIP = int(arg.split('=')[1])


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
                                  data=json.dumps(body).encode() if body else None,
                                  headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())


# Google Maps embeds place IDs as "ChIJ..." strings in multiple places:
# - In place URL path: /maps/place/.../@.../.../data=!...!1sChIJxxx
# - In "ludocid" params
# - In JSON-LD @id references
# - In "data-hveid" or similar attrs
# Pattern matches any ChIJ followed by base64-ish chars (place_ids are
# typically 27 chars but pattern is flexible).
PLACE_ID_PATTERN = re.compile(r'\b(ChIJ[A-Za-z0-9_-]{20,40})\b')


# Extract business name near a place_id occurrence as best-effort.
# Not essential — place_id is enough for later enrichment.
def extract_candidates(blob, seed_place_id):
    """Return set of place_ids found in the page, excluding the seed."""
    ids = set(PLACE_ID_PATTERN.findall(blob))
    ids.discard(seed_place_id)
    return ids


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    log('=' * 60)
    log('Crawl4AI nearby-discovery sweep')
    log(f'LIMIT={LIMIT if LIMIT else "no limit"} SKIP={SKIP}')
    log('=' * 60)

    # Load ALL place_ids currently in DB to dedupe
    log('Loading existing place_ids from DB...')
    existing_ids = set()
    offset = 0
    while True:
        page = sb_req('GET',
            f'/rest/v1/listings?select=google_place_id&google_place_id=not.is.null&limit=1000&offset={offset}')
        if not page: break
        for r in page:
            if r.get('google_place_id'):
                existing_ids.add(r['google_place_id'])
        if len(page) < 1000: break
        offset += 1000
    log(f'  {len(existing_ids)} place_ids in DB (seed + dedupe set)')

    # Load seeds: approved touchless listings with place_ids, prioritize
    # high-review-count (most likely to have a meaningful "nearby" section)
    seeds = []
    offset = 0
    while True:
        page = sb_req('GET',
            '/rest/v1/listings?select=id,name,city,state,google_place_id,review_count'
            '&is_touchless=eq.true'
            '&is_approved=eq.true'
            '&google_place_id=not.is.null'
            '&order=review_count.desc.nullslast'
            f'&limit=1000&offset={offset}')
        if not page: break
        seeds.extend(page)
        if len(page) < 1000: break
        offset += 1000

    log(f'Loaded {len(seeds)} approved touchless seeds')

    if SKIP > 0:
        seeds = seeds[SKIP:]
        log(f'After skip: {len(seeds)}')
    if LIMIT > 0:
        seeds = seeds[:LIMIT]
        log(f'After limit: {len(seeds)}')

    config = BrowserConfig(
        headless=True,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport_width=1280, viewport_height=900,
    )
    run_config = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=3.0)

    # Candidates: place_id → {seeds: [seed_id], first_seen: ts}
    candidates = {}
    # Resume support: load existing output if present
    if os.path.exists(OUT_FILE):
        try:
            with open(OUT_FILE) as f:
                prior = json.load(f)
            for c in prior.get('candidates', []):
                candidates[c['place_id']] = {'seeds': c.get('seeds', []), 'first_seen': c.get('first_seen')}
            log(f'Resumed with {len(candidates)} candidates from prior run')
        except Exception:
            pass

    done = 0
    errors = 0
    new_this_run = 0

    async with AsyncWebCrawler(config=config) as crawler:
        consecutive_errors = 0
        for i, seed in enumerate(seeds):
            seed_pid = seed['google_place_id']
            url = f'https://www.google.com/maps/place/?q=place_id:{seed_pid}'
            try:
                result = await crawler.arun(url, config=run_config)
                blob = (result.markdown or '') + '\n' + (result.html or '')
                if len(blob) < 1000:
                    errors += 1
                    consecutive_errors += 1
                    # Back off on consecutive errors (likely Google throttling)
                    if consecutive_errors >= 5:
                        log(f'    ⏸  {consecutive_errors} consecutive errors — sleeping 60s to let Google cool down')
                        await asyncio.sleep(60)
                        consecutive_errors = 0
                    continue
                consecutive_errors = 0
                found = extract_candidates(blob, seed_pid)
                new_candidates = found - existing_ids
                for pid in new_candidates:
                    if pid not in candidates:
                        candidates[pid] = {'seeds': [seed['id']], 'first_seen': datetime.datetime.now().isoformat()}
                        new_this_run += 1
                    elif seed['id'] not in candidates[pid]['seeds']:
                        candidates[pid]['seeds'].append(seed['id'])
                done += 1
                if done <= 10 or done % 25 == 0:
                    log(f'  [{i+1}/{len(seeds)}] {seed["name"][:30]:<30} found:{len(found)} new_to_db:{len(new_candidates)} total_candidates:{len(candidates)}')
                # Save progress every 100 seeds
                if done % 100 == 0:
                    save_candidates(candidates)
                    log(f'    ── checkpoint saved: {len(candidates)} candidates ──')
            except Exception as e:
                errors += 1
                log(f'  [{i+1}/{len(seeds)}] ❌ {seed["name"][:30]:<30} | {str(e)[:80]}')

    save_candidates(candidates)
    log('=' * 60)
    log(f'Nearby discovery complete:')
    log(f'  Seeds processed: {done}')
    log(f'  Errors: {errors}')
    log(f'  New candidates this run: {new_this_run}')
    log(f'  Total candidates in output file: {len(candidates)}')
    log(f'  Audit: {OUT_FILE}')
    log('=' * 60)


def save_candidates(candidates):
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    out = {
        'timestamp': datetime.datetime.now().isoformat(),
        'total_candidates': len(candidates),
        'candidates': [
            {'place_id': pid, 'seeds': v['seeds'], 'first_seen': v['first_seen']}
            for pid, v in candidates.items()
        ],
    }
    with open(OUT_FILE, 'w') as f:
        json.dump(out, f, indent=2)


if __name__ == '__main__':
    asyncio.run(main())
