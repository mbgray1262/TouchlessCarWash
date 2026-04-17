#!/usr/bin/env python3
"""
Drive the ai-audit-listing edge function across all approved-touchless
listings. Concurrent up to 4 workers to keep throughput high while
respecting Gemini free-tier rate limits.

Re-entrant: uses ai_audits table's listing_id unique constraint. Re-runs
will UPSERT, so stopping and restarting is safe.

Run: python3 scripts/drive-ai-audit.py [--limit N] [--concurrency N] [--force]
  --limit N: cap the number of listings audited (default: no limit)
  --concurrency N: parallel workers (default: 4)
  --force: re-audit even if listing already has a row in ai_audits
  --ids id1,id2,...: audit specific listing IDs only (test mode)
"""
import asyncio, json, os, ssl, sys, time, datetime, urllib.request

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
FN_URL = f'{SUPABASE_URL}/functions/v1/ai-audit-listing'

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'drive-ai-audit.log')

LIMIT = 0
CONCURRENCY = 4
FORCE = False
IDS_ARG: list[str] = []
for i, a in enumerate(sys.argv[1:], 1):
    if a.startswith('--limit='): LIMIT = int(a.split('=')[1])
    elif a == '--limit' and i < len(sys.argv) - 1: LIMIT = int(sys.argv[i + 1])
    elif a.startswith('--concurrency='): CONCURRENCY = int(a.split('=')[1])
    elif a == '--concurrency' and i < len(sys.argv) - 1: CONCURRENCY = int(sys.argv[i + 1])
    elif a == '--force': FORCE = True
    elif a.startswith('--ids='): IDS_ARG = a.split('=')[1].split(',')


def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f: f.write(line + '\n')


def sb_req(method, path, body=None):
    headers = {'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}',
               'Content-Type': 'application/json', 'Prefer': 'return=representation'}
    req = urllib.request.Request(f'{SUPABASE_URL}{path}',
        data=json.dumps(body).encode() if body else None,
        headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60, context=ssl_ctx) as r:
        return json.loads(r.read())


async def audit_one(session_queue: asyncio.Queue, listing_id: str, stats: dict):
    loop = asyncio.get_event_loop()
    try:
        def do():
            req = urllib.request.Request(
                FN_URL,
                data=json.dumps({'listing_id': listing_id}).encode(),
                headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {SUPABASE_ANON}'},
                method='POST')
            with urllib.request.urlopen(req, timeout=120, context=ssl_ctx) as r:
                return json.loads(r.read())
        res = await loop.run_in_executor(None, do)
        v = res.get('verdict') or {}
        verdict = v.get('verdict') if isinstance(v, dict) else None
        stats['done'] += 1
        stats['by_verdict'][verdict or 'unknown'] = stats['by_verdict'].get(verdict or 'unknown', 0) + 1
        if stats['done'] % 10 == 0 or stats['done'] < 5:
            log(f"  [{stats['done']}/{stats['total']}] {verdict or '?'}  (photos={res.get('photos_analyzed','?')})")
    except Exception as e:
        stats['errors'] += 1
        log(f"  ❌ {listing_id[:8]}: {str(e)[:120]}")


async def main():
    log('=' * 60)
    log(f'AI audit driver — concurrency={CONCURRENCY} limit={LIMIT or "none"} force={FORCE}')
    log('=' * 60)

    if IDS_ARG:
        ids = IDS_ARG
        log(f'Using {len(ids)} IDs from --ids flag')
    else:
        # Load approved-touchless listing IDs
        ids = []
        offset = 0
        while True:
            rows = sb_req('GET', f'/rest/v1/listings?select=id&is_touchless=eq.true&is_approved=eq.true&limit=1000&offset={offset}')
            if not rows: break
            ids.extend([r['id'] for r in rows])
            if len(rows) < 1000: break
            offset += 1000
        log(f'Approved touchless listings: {len(ids)}')

        if not FORCE:
            already = set()
            offset = 0
            while True:
                rows = sb_req('GET', f'/rest/v1/ai_audits?select=listing_id&limit=1000&offset={offset}')
                if not rows: break
                for r in rows: already.add(r['listing_id'])
                if len(rows) < 1000: break
                offset += 1000
            ids = [i for i in ids if i not in already]
            log(f'After skipping {len(already)} already audited: {len(ids)} to audit')

    if LIMIT > 0:
        ids = ids[:LIMIT]
        log(f'Applying --limit: {len(ids)} IDs')

    stats = {'total': len(ids), 'done': 0, 'errors': 0, 'by_verdict': {}}

    sem = asyncio.Semaphore(CONCURRENCY)
    async def run_one(lid):
        async with sem:
            await audit_one(None, lid, stats)

    start = time.time()
    await asyncio.gather(*(run_one(i) for i in ids), return_exceptions=True)
    elapsed = time.time() - start

    log('=' * 60)
    log(f'Complete: {stats["done"]}/{stats["total"]} done, {stats["errors"]} errors, {elapsed/60:.1f}m elapsed')
    log('Verdict distribution:')
    for v, n in sorted(stats['by_verdict'].items(), key=lambda x: -x[1]):
        log(f'  {v}: {n}')
    log('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
