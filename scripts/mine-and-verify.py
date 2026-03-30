#!/usr/bin/env python3
"""
Targeted review mining + verification pass.

Mines all listings queued for verification:
  - is_touchless=true, review_mine_status=null (726 no-evidence listings)
  - is_touchless=null, review_mine_status=null (Washworld unknowns + Holiday)

After mining completes, reverts any is_touchless=true listings that came back
scanned_clean with no touchless_verified — these had no evidence before and
review mining found none, so they should not be shown as confirmed touchless.

Logs to: scripts/mine-and-verify.log
"""
import os, json, ssl, urllib.request, time, datetime

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

BASE      = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
ANON_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
LOG_FILE  = os.path.join(os.path.dirname(__file__), 'mine-and-verify.log')

def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

def post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(f'{BASE}{path}', data=data,
        headers={'Content-Type': 'application/json',
                 'Authorization': f'Bearer {ANON_KEY}'})
    with urllib.request.urlopen(req, timeout=150, context=ssl_ctx) as r:
        return json.loads(r.read())

def scan_batch():
    return post('/functions/v1/review-mine',
                {'action': 'scan_batch', 'batch_size': 50, 'all_listings': True})

# ── Phase 1: Mine ────────────────────────────────────────────────────────────
log('=' * 60)
log('Mine-and-verify pass started')
log('=' * 60)

batch = 0
total_scanned = 0
total_touchless = 0
total_errors = 0
consecutive_errors = 0
start = time.time()

while True:
    try:
        r = scan_batch()
        scanned      = r.get('scanned_this_batch', 0)
        touchless    = r.get('found_touchless', 0)
        complete     = r.get('complete', False)
        batch += 1
        total_scanned  += scanned
        total_touchless += touchless
        consecutive_errors = 0

        if touchless or r.get('ai_rejected', 0):
            for res in r.get('results', []):
                if res.get('status') == 'touchless_found':
                    log(f'  ✓ TOUCHLESS: {res["name"]} — {res["city"]}, {res["state"]} ({res.get("reviewCount",0)} snippets)')
                elif res.get('status') == 'ai_rejected':
                    log(f'  ✗ REJECTED:  {res["name"]} — {res["city"]}, {res["state"]}')
                elif res.get('status') == 'error':
                    total_errors += 1

        elapsed = int(time.time() - start)
        log(f'Batch {batch}: scanned={scanned} touchless={touchless} '
            f'errors={total_errors} ({elapsed}s elapsed)')

        if complete or scanned == 0:
            log('Mining phase complete.')
            break

        time.sleep(3)

    except Exception as e:
        consecutive_errors += 1
        log(f'ERROR (batch {batch}): {e}')
        if consecutive_errors >= 5:
            log('5 consecutive errors — stopping mining phase.')
            break
        time.sleep(10)

log('')
log(f'Mining summary: {total_scanned} scanned | {total_touchless} touchless | {total_errors} errors')

# ── Phase 2: Revert no-evidence listings ─────────────────────────────────────
log('')
log('--- Phase 2: Reverting no-evidence listings ---')

# Find is_touchless=true listings that mined as scanned_clean with no verification
req = urllib.request.Request(
    f'{BASE}/rest/v1/listings'
    f'?is_touchless=eq.true'
    f'&review_mine_status=eq.scanned_clean'
    f'&touchless_verified=is.null'
    f'&google_place_id=not.is.null'
    f'&select=id,name,city,state'
    f'&limit=2000',
    headers={'apikey': ANON_KEY, 'Authorization': f'Bearer {ANON_KEY}'}
)
with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
    no_evidence = json.loads(r.read())

log(f'Found {len(no_evidence)} is_touchless=true listings with no review evidence after mining')

if no_evidence:
    log('Sample:')
    for l in no_evidence[:8]:
        log(f'  {l["name"]} — {l["city"]}, {l["state"]}')
    if len(no_evidence) > 8:
        log(f'  ... and {len(no_evidence)-8} more')

    # Revert via supabase CLI SQL (write to temp file)
    ids_sql = ', '.join(f"'{l['id']}'" for l in no_evidence)
    sql = f"""UPDATE listings
SET
    is_touchless = false,
    is_approved = false,
    crawl_notes = 'Reverted: no touchless evidence found in review mining — unconfirmed',
    crawl_status = 'classified'
WHERE id IN ({ids_sql});"""

    sql_path = '/tmp/revert-no-evidence.sql'
    with open(sql_path, 'w') as f:
        f.write(sql)

    import subprocess
    result = subprocess.run(
        ['npx', 'supabase', 'db', 'query', '--linked', sql],
        capture_output=True, text=True,
        cwd='/Users/michaelgray/Projects/TouchlessCarWash'
    )
    if result.returncode == 0:
        log(f'Reverted {len(no_evidence)} listings to is_touchless=false')
    else:
        log(f'Revert failed: {result.stderr[:200]}')
        log(f'SQL saved to {sql_path} — run manually if needed')
else:
    log('No listings to revert — all mined listings had evidence!')

# ── Final summary ─────────────────────────────────────────────────────────────
log('')
log('=' * 60)
log('COMPLETE')
log(f'  Mined:    {total_scanned} listings')
log(f'  Kept:     {total_touchless} newly confirmed touchless')
log(f'  Reverted: {len(no_evidence)} with no evidence')
log('=' * 60)
