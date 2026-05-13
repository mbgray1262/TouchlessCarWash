#!/usr/bin/env python3
"""
Detect permanently-closed and temporarily-closed listings by crawling
Google Maps pages for every approved touchless listing with a place_id.

Updates `business_status` column:
  OPERATIONAL         — default, still open
  CLOSED_TEMPORARILY  — Google shows "Temporarily closed"
  CLOSED_PERMANENTLY  — Google shows "Permanently closed" (will flip is_approved=false)

Run: python3 scripts/crawl4ai-closed-detection.py [--limit N] [--skip N]
Completely free — uses Crawl4AI (Playwright).
"""
import asyncio, json, re, ssl, urllib.request, sys, os, datetime
from urllib.parse import quote

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'crawl4ai-closed-detection.log')

LIMIT = 0
SKIP = 0
UNSCANNED_ONLY = False
for arg in sys.argv[1:]:
    if arg.startswith('--limit='):
        LIMIT = int(arg.split('=')[1])
    elif arg.startswith('--skip='):
        SKIP = int(arg.split('=')[1])
    elif arg == '--unscanned-only':
        UNSCANNED_ONLY = True


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


# STRICT patterns — only exact phrases Google Maps shows on closed places.
# Anything ambiguous (404 text, nav items, image alts) must NOT match.
# Case-sensitive on purpose — Google's UI uses Title Case "Permanently closed".
PERMANENT_PATTERNS = [
    re.compile(r'Permanently\s+closed'),       # visible UI text
    re.compile(r'"CLOSED_PERMANENTLY"'),       # JSON data attribute
]
TEMPORARY_PATTERNS = [
    re.compile(r'Temporarily\s+closed'),       # visible UI text
    re.compile(r'"CLOSED_TEMPORARILY"'),       # JSON data attribute
]


def detect_status(blob, has_address, has_rating):
    """Return 'CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY', or 'OPERATIONAL'.

    SAFETY: only returns closed status if the specific closed-status string
    appears AND the page actually loaded a real business card (address or
    rating present). This prevents false positives from 404 pages / Google
    error pages / empty responses where "closed" text might appear in
    unrelated boilerplate.
    """
    # If we couldn't confirm the page actually loaded a business, don't
    # change status — return OPERATIONAL and let human review handle it
    if not (has_address or has_rating):
        return 'OPERATIONAL'
    for pat in PERMANENT_PATTERNS:
        if pat.search(blob):
            return 'CLOSED_PERMANENTLY'
    for pat in TEMPORARY_PATTERNS:
        if pat.search(blob):
            return 'CLOSED_TEMPORARILY'
    return 'OPERATIONAL'


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    log('=' * 60)
    log('Crawl4AI closed-business detection')
    log(f'LIMIT={LIMIT if LIMIT else "no limit"} SKIP={SKIP}')
    log('=' * 60)

    # Load all approved touchless listings with a place_id.
    # When --unscanned-only is set, restrict to listings whose business_status
    # is still null (i.e., never scanned). Useful for incremental runs as
    # newly-promoted listings flow in.
    rows = []
    offset = 0
    unscanned_filter = '&business_status=is.null' if UNSCANNED_ONLY else ''
    while True:
        page = sb_req('GET',
            '/rest/v1/listings?select=id,name,city,state,google_place_id,business_status'
            '&is_touchless=eq.true'
            '&is_approved=eq.true'
            '&google_place_id=not.is.null'
            f'{unscanned_filter}'
            f'&limit=1000&offset={offset}')
        if not page: break
        rows.extend(page)
        if len(page) < 1000: break
        offset += 1000

    log(f'Loaded {len(rows)} approved touchless listings with place_id')

    if SKIP > 0:
        rows = rows[SKIP:]
        log(f'After skip: {len(rows)}')
    if LIMIT > 0:
        rows = rows[:LIMIT]
        log(f'After limit: {len(rows)}')

    config = BrowserConfig(
        headless=True,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport_width=1280, viewport_height=900,
    )
    run_config = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=2.5)

    counts = {'OPERATIONAL': 0, 'CLOSED_TEMPORARILY': 0, 'CLOSED_PERMANENTLY': 0, 'UNVERIFIED': 0, 'ERROR': 0}
    changes = []

    # Signal that a real business card was rendered on the page
    RATING_SIGNAL = re.compile(r'\b[1-5]\.\d\s*\(\s*[\d,]+\s*\)')
    ADDRESS_SIGNAL = re.compile(r'\b\d{5}(?:-\d{4})?\b')  # US ZIP

    async with AsyncWebCrawler(config=config) as crawler:
        consecutive_errors = 0
        for i, l in enumerate(rows):
            pid = l['google_place_id']
            url = f'https://www.google.com/maps/place/?q=place_id:{pid}'
            try:
                result = await crawler.arun(url, config=run_config)
                blob = (result.markdown or '') + '\n' + (result.html or '')
                if len(blob) < 1000:
                    counts['ERROR'] += 1
                    consecutive_errors += 1
                    log(f'  [{i+1}/{len(rows)}] ⚠️  {l["name"][:30]:<30} | short response ({len(blob)}b)')
                    if consecutive_errors >= 5:
                        log(f'    ⏸  {consecutive_errors} consecutive short responses — sleeping 60s to let Google cool down')
                        await asyncio.sleep(60)
                        consecutive_errors = 0
                    continue
                consecutive_errors = 0

                has_rating = bool(RATING_SIGNAL.search(blob))
                has_address = bool(ADDRESS_SIGNAL.search(blob))
                status = detect_status(blob, has_address, has_rating)

                # If the page didn't load enough to verify, bucket as UNVERIFIED
                # and do NOT write to DB (safer than a false positive)
                if not (has_address or has_rating):
                    counts['UNVERIFIED'] += 1
                    if (i + 1) % 50 == 0 or (i + 1) <= 5:
                        log(f'  [{i+1}/{len(rows)}] 🚫 {l["name"][:30]:<30} | UNVERIFIED (page did not load business card) — no DB change')
                    continue

                counts[status] = counts.get(status, 0) + 1

                # Only write when we have a CLOSED verdict (safer default)
                if status in ('CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'):
                    patch = {'business_status': status}
                    if status == 'CLOSED_PERMANENTLY':
                        patch['is_approved'] = False
                        patch['crawl_notes'] = 'Auto-unapproved: Google Maps shows Permanently Closed.'
                    sb_req('PATCH', f'/rest/v1/listings?id=eq.{l["id"]}', patch)
                    icon = {'CLOSED_PERMANENTLY': '⛔', 'CLOSED_TEMPORARILY': '⏸'}.get(status, '?')
                    log(f'  [{i+1}/{len(rows)}] {icon} {l["name"][:30]:<30} {l["city"]}, {l["state"]} | {status}')
                    changes.append({'id': l['id'], 'name': l['name'], 'city': l['city'], 'state': l['state'], 'status': status})
                elif status == 'OPERATIONAL' and l.get('business_status') != 'OPERATIONAL':
                    # Backfill OPERATIONAL where previously null
                    sb_req('PATCH', f'/rest/v1/listings?id=eq.{l["id"]}', {'business_status': 'OPERATIONAL'})

                if (i + 1) % 50 == 0:
                    log(f'    ── progress: {i+1}/{len(rows)}  OP:{counts["OPERATIONAL"]}  TEMP:{counts["CLOSED_TEMPORARILY"]}  PERM:{counts["CLOSED_PERMANENTLY"]}  UNV:{counts["UNVERIFIED"]}  ERR:{counts["ERROR"]} ──')
            except Exception as e:
                counts['ERROR'] += 1
                log(f'  [{i+1}/{len(rows)}] ❌ {l["name"][:30]:<30} | {str(e)[:80]}')

    log('=' * 60)
    log(f'Closed-business scan complete:')
    for k, v in counts.items():
        log(f'  {k}: {v}')
    log(f'Total non-OPERATIONAL changes: {len(changes)}')
    log('=' * 60)

    # Save changes JSON for audit
    out_path = os.path.join(os.path.dirname(__file__), 'discovery-output', 'closed-detection-audit.json')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump({'timestamp': datetime.datetime.now().isoformat(), 'counts': counts, 'changes': changes}, f, indent=2)
    log(f'Audit saved: {out_path}')


if __name__ == '__main__':
    asyncio.run(main())
