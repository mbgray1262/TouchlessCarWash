#!/usr/bin/env python3
"""
OpenMart ID comparison script.

Fetches Google Place IDs for "touchless car wash" from OpenMart's free
only_ids endpoint (top ~15,000 by match score), then cross-references
against our Supabase DB to find net-new listings not yet in our database.

Stops when credits are exhausted or results drop below a minimum match score.

Logs to: scripts/openmart-compare.log
"""
import os, json, ssl, urllib.request, time, datetime

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

OPENMART_KEY  = 'FG3HdmtmpTAPwj8AXE_ZD7BFxdvMakFP2xDPsLV92YU'
SUPABASE_URL  = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

MIN_MATCH_SCORE = 150  # stop fetching below this relevance threshold
LOG_FILE = os.path.join(os.path.dirname(__file__), 'openmart-compare.log')

def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

def openmart_post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f'https://api.openmart.ai{path}', data=data,
        headers={'Content-Type': 'application/json',
                 'Authorization': f'Bearer {OPENMART_KEY}'}
    )
    with urllib.request.urlopen(req, timeout=60, context=ssl_ctx) as r:
        return json.loads(r.read())

def openmart_get(path):
    req = urllib.request.Request(
        f'https://api.openmart.ai{path}',
        headers={'Authorization': f'Bearer {OPENMART_KEY}'}
    )
    with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as r:
        return json.loads(r.read())

def supabase_head(params):
    """Return count for a Supabase query via HEAD + Content-Range."""
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/listings?{params}&select=id',
        headers={'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}',
                 'Prefer': 'count=exact'},
        method='HEAD'
    )
    with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as r:
        cr = r.headers.get('Content-Range', '0/0')
        return int(cr.split('/')[-1])

def check_place_ids_in_db(place_ids):
    """Return set of place_ids that already exist in our DB."""
    # Supabase supports .in() filter via query param: google_place_id=in.(id1,id2,...)
    # Batch in chunks of 200 to stay within URL limits
    found = set()
    chunk_size = 200
    for i in range(0, len(place_ids), chunk_size):
        chunk = place_ids[i:i+chunk_size]
        ids_str = ','.join(chunk)
        url = f'{SUPABASE_URL}/rest/v1/listings?google_place_id=in.({ids_str})&select=google_place_id'
        req = urllib.request.Request(
            url, headers={'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}'}
        )
        with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
            rows = json.loads(r.read())
            for row in rows:
                if row.get('google_place_id'):
                    found.add(row['google_place_id'])
    return found

def main():
    log('=' * 60)
    log('OpenMart vs DB comparison started')
    log('=' * 60)

    # Check starting credit balance
    credits = openmart_get('/api/v2/credit-balance')
    log(f'OpenMart credits remaining: {credits["balance"]}')

    # Fetch all touchless car wash place IDs from OpenMart
    all_place_ids   = []   # all from OpenMart
    net_new_ids     = []   # not in our DB
    already_have    = []   # already in our DB
    cursor          = None
    page            = 0
    stopped_reason  = 'exhausted'

    while True:
        body = {
            'query': 'touchless car wash',
            'country': 'US',
            'limit': 1000,
        }
        if cursor:
            body['cursor'] = cursor

        try:
            records = openmart_post('/api/v1/search/only_ids', body)
        except Exception as e:
            log(f'OpenMart API error: {e}')
            break

        if not records:
            log('Empty response — done.')
            stopped_reason = 'empty'
            break

        records = records if isinstance(records, list) else records.get('data', [])
        if not records:
            log('No data in response — done.')
            stopped_reason = 'empty'
            break

        page += 1
        page_ids    = [r['place_id'] for r in records if r.get('place_id')]
        last_score  = records[-1].get('match_score', 0)
        cursor      = records[-1].get('cursor')

        # Cross-reference this page against DB
        in_db = check_place_ids_in_db(page_ids)
        new_this_page = [pid for pid in page_ids if pid not in in_db]

        all_place_ids.extend(page_ids)
        net_new_ids.extend(new_this_page)
        already_have.extend([pid for pid in page_ids if pid in in_db])

        log(f'Page {page:>3}: {len(page_ids):>5} IDs | '
            f'{len(new_this_page):>4} net-new | '
            f'{len(in_db):>4} already have | '
            f'last score: {last_score:.1f} | '
            f'cumulative new: {len(net_new_ids):,}')

        # Stop if match score drops below threshold
        if last_score < MIN_MATCH_SCORE:
            log(f'Match score {last_score:.1f} < {MIN_MATCH_SCORE} — stopping (relevance too low)')
            stopped_reason = 'score_threshold'
            break

        # Stop if no more cursor
        if not cursor:
            log('No cursor returned — end of results')
            stopped_reason = 'no_cursor'
            break

        # Check credits after every 5 pages
        if page % 5 == 0:
            credits = openmart_get('/api/v2/credit-balance')
            log(f'  Credits remaining: {credits["balance"]}')
            if credits['balance'] < 5:
                log('Credits nearly exhausted — stopping')
                stopped_reason = 'low_credits'
                break

        time.sleep(0.5)

    # Final summary
    log('')
    log('=' * 60)
    log('RESULTS SUMMARY')
    log('=' * 60)
    log(f'Total OpenMart IDs fetched:    {len(all_place_ids):,}')
    log(f'Already in our DB:             {len(already_have):,}  ({100*len(already_have)//max(len(all_place_ids),1)}%)')
    log(f'Net-new (not in DB):           {len(net_new_ids):,}  ({100*len(net_new_ids)//max(len(all_place_ids),1)}%)')
    log(f'Stopped because:               {stopped_reason}')
    log('')

    # Save net-new IDs to file for the import pipeline
    out_path = os.path.join(os.path.dirname(__file__), 'openmart-net-new-place-ids.json')
    with open(out_path, 'w') as f:
        json.dump({'net_new_place_ids': net_new_ids, 'generated_at': str(datetime.datetime.now())}, f, indent=2)
    log(f'Net-new IDs saved to: {out_path}')

    # Check final credit balance
    credits = openmart_get('/api/v2/credit-balance')
    log(f'Final OpenMart credits remaining: {credits["balance"]}')

if __name__ == '__main__':
    main()
