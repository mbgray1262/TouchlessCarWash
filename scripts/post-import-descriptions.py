#!/usr/bin/env python3
"""
Post-import description generation pipeline.
Run after all chain/bulk imports finish to:
  1. Generate AI listing descriptions for all touchless listings missing them
  2. Generate city descriptions for all cities missing them
  3. Generate state descriptions for any states missing them

All three use the Supabase edge functions with start → process_batch loops.
"""
import json, ssl, urllib.request, urllib.error, time, datetime, sys

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
EDGE_BASE = f'{SUPABASE_URL}/functions/v1'

def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    print(f'[{ts}] {msg}', flush=True)

def http_json(method, url, headers=None, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    with urllib.request.urlopen(req, context=ssl_ctx, timeout=60) as r:
        return json.loads(r.read())

def edge_post(fn, body):
    headers = {
        'Authorization': f'Bearer {SUPABASE_ANON}',
        'Content-Type': 'application/json',
    }
    return http_json('POST', f'{EDGE_BASE}/{fn}', headers=headers, body=body)

# ── Phase 1: Listing descriptions ─────────────────────────────────────────────

def run_listing_descriptions():
    log('=' * 60)
    log('Phase 1: Generating AI descriptions for listings missing them')
    log('=' * 60)

    # Start a new job
    try:
        resp = edge_post('generate-descriptions', {'action': 'start'})
        job_id = resp.get('job_id')
        total = resp.get('total', 0)
        if not total:
            log('No listings missing descriptions — skipping.')
            return
        log(f'Job {job_id}: {total} listings need descriptions')
    except Exception as e:
        log(f'ERROR starting description job: {e}')
        return

    completed = failed = 0
    while True:
        try:
            resp = edge_post('generate-descriptions', {'action': 'process_batch', 'job_id': job_id})
            if resp.get('done'):
                log(f'Descriptions done. completed={completed} failed={failed}')
                break
            if resp.get('success'):
                completed += 1
                if completed % 25 == 0:
                    log(f'  Descriptions: {completed}/{total}')
            else:
                failed += 1
                log(f'  FAIL: {resp.get("error", "unknown")}')
            time.sleep(0.3)
        except Exception as e:
            log(f'  process_batch error: {e}')
            time.sleep(5)

# ── Phase 2: City descriptions ────────────────────────────────────────────────

def run_city_descriptions():
    log('=' * 60)
    log('Phase 2: Generating city descriptions for cities missing them')
    log('=' * 60)

    try:
        resp = edge_post('generate-city-descriptions', {'action': 'start'})
        job_id = resp.get('job_id')
        total = resp.get('total', 0)
        if not total:
            log('No cities missing descriptions — skipping.')
            return
        log(f'Job {job_id}: {total} cities need descriptions')
    except Exception as e:
        log(f'ERROR starting city description job: {e}')
        return

    completed = failed = 0
    while True:
        try:
            resp = edge_post('generate-city-descriptions', {'action': 'process_batch', 'job_id': job_id})
            if resp.get('done'):
                log(f'City descriptions done. completed={completed} failed={failed}')
                break
            if resp.get('success'):
                completed += 1
                city = resp.get('city', '')
                if completed % 10 == 0:
                    log(f'  Cities: {completed}/{total} (latest: {city})')
            else:
                failed += 1
                log(f'  FAIL: {resp.get("city","")} — {resp.get("error", "unknown")}')
            time.sleep(0.5)
        except Exception as e:
            log(f'  process_batch error: {e}')
            time.sleep(5)

# ── Phase 3: State descriptions ───────────────────────────────────────────────

def run_state_descriptions():
    log('=' * 60)
    log('Phase 3: Generating state descriptions for states missing them')
    log('=' * 60)

    try:
        resp = edge_post('generate-state-descriptions', {'action': 'start'})
        job_id = resp.get('job_id')
        total = resp.get('total', 0)
        if not total:
            log('No states missing descriptions — skipping.')
            return
        log(f'Job {job_id}: {total} states need descriptions')
    except Exception as e:
        log(f'ERROR starting state description job: {e}')
        return

    completed = failed = 0
    while True:
        try:
            resp = edge_post('generate-state-descriptions', {'action': 'process_batch', 'job_id': job_id})
            if resp.get('done'):
                log(f'State descriptions done. completed={completed} failed={failed}')
                break
            if resp.get('success'):
                completed += 1
                log(f'  State done: {resp.get("state", "")}')
            else:
                failed += 1
                log(f'  FAIL: {resp.get("state","")} — {resp.get("error", "unknown")}')
            time.sleep(1)
        except Exception as e:
            log(f'  process_batch error: {e}')
            time.sleep(5)

# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    log('Post-import description pipeline starting...')
    run_listing_descriptions()
    run_city_descriptions()
    run_state_descriptions()
    log('All description generation complete.')
