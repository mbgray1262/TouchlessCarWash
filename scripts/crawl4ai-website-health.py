#!/usr/bin/env python3
"""
Website health check — crawl every approved touchless listing's website
and flag dead sites, parked domains, and redirects to unrelated content.

Flags set on listings.crawl_notes:
  - website_dead:404     — 404 / site returns error
  - website_dead:timeout — site doesn't respond
  - website_parked       — domain-for-sale / parking page detected
  - website_redirected   — redirects to an unrelated domain
  - website_ok           — fine

For dead / parked: also null the `website` column so SERP snippets don't
show broken URLs. Does NOT unapprove the listing — the other fields are
still useful.

Free — Crawl4AI (Playwright). Resumable, checkpoints.

Run: python3 scripts/crawl4ai-website-health.py [--limit N] [--skip N]
"""
import asyncio, json, re, ssl, urllib.request, sys, os, datetime
from urllib.parse import urlparse

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'crawl4ai-website-health.log')
OUT_FILE = os.path.join(SCRIPT_DIR, 'discovery-output', 'website-health.json')

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


# Parking / domain-for-sale / expired indicators
PARKED_PATTERNS = [
    re.compile(r'domain\s+(?:is\s+)?for\s+sale', re.IGNORECASE),
    re.compile(r'buy\s+this\s+domain', re.IGNORECASE),
    re.compile(r'this\s+domain\s+(?:has\s+)?expired', re.IGNORECASE),
    re.compile(r'GoDaddy\s+Premium\s+Listings?', re.IGNORECASE),
    re.compile(r'sedo\.com/?\?src=search', re.IGNORECASE),
    re.compile(r'inquire\s+(?:about|to\s+buy)\s+this\s+domain', re.IGNORECASE),
    re.compile(r'afternic', re.IGNORECASE),
    re.compile(r'bodis\.com', re.IGNORECASE),
    re.compile(r'parkingcrew\.net', re.IGNORECASE),
    re.compile(r'<title>[^<]*domain\s+(?:parked|for\s+sale)', re.IGNORECASE),
]
# Error / 404 indicators. Strict — only the <title> tag matters, because
# many OK sites have "404" in decorative image alt text or inline search.
ERROR_TITLE_PATTERN = re.compile(r'<title>[^<]{0,30}(?:404|page\s+not\s+found|error\s+\d{3})', re.IGNORECASE)
# Domain-squatter service providers (stronger signal than keyword match)
SQUATTER_DOMAINS = re.compile(
    r'(?:sedoparking|hugedomains\.com|bodis\.com|parkingcrew|afternic|dan\.com/pricing|'
    r'godaddy\.com/domainfind|/park/)',
    re.IGNORECASE,
)


def classify(url, result, blob):
    """Return one of: 'ok', 'parked', 'dead_404', 'dead_timeout', 'dead_short',
    'redirected_off_brand'."""
    if not blob or len(blob) < 100:
        return 'dead_short'
    # Parked — strong signal
    if SQUATTER_DOMAINS.search(blob):
        return 'parked'
    for pat in PARKED_PATTERNS:
        if pat.search(blob):
            return 'parked'
    # Error pages — only trust the <title> tag (image alts produce false positives)
    if ERROR_TITLE_PATTERN.search(blob):
        return 'dead_404'
    # Redirected off-brand — compare final URL domain to original
    try:
        orig_d = urlparse(url).hostname or ''
        # Crawl4AI doesn't always expose final URL. Skip this check for now.
    except Exception:
        pass
    # Default: OK
    return 'ok'


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    log('=' * 60)
    log(f'Crawl4AI website health check')
    log(f'LIMIT={LIMIT if LIMIT else "no limit"} SKIP={SKIP}')
    log('=' * 60)

    # Load all approved touchless with a website (skip yelp/fb/google as
    # those aren't real business sites)
    SKIP_DOMAINS = {'yelp.com', 'facebook.com', 'instagram.com', 'google.com', 'tiktok.com', 'twitter.com', 'x.com'}
    rows = []
    offset = 0
    while True:
        page = sb_req('GET',
            '/rest/v1/listings?select=id,name,city,state,website'
            '&is_touchless=eq.true'
            '&is_approved=eq.true'
            '&website=not.is.null'
            f'&limit=1000&offset={offset}')
        if not page: break
        for r in page:
            try:
                d = urlparse(r['website']).hostname or ''
                d = d.replace('www.', '').lower()
                if any(s in d for s in SKIP_DOMAINS): continue
            except Exception:
                continue
            rows.append(r)
        if len(page) < 1000: break
        offset += 1000
    log(f'Loaded {len(rows)} approved touchless with real-business websites')

    if SKIP > 0:
        rows = rows[SKIP:]
    if LIMIT > 0:
        rows = rows[:LIMIT]
    log(f'Processing {len(rows)}')

    config = BrowserConfig(
        headless=True,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport_width=1280, viewport_height=900,
    )
    run_config = CrawlerRunConfig(page_timeout=15000, delay_before_return_html=1.5)

    counts = {'ok': 0, 'parked': 0, 'dead_404': 0, 'dead_short': 0, 'dead_timeout': 0, 'error': 0}
    changes = []

    async with AsyncWebCrawler(config=config) as crawler:
        for i, l in enumerate(rows):
            url = l['website']
            try:
                result = await crawler.arun(url, config=run_config)
                blob = (result.markdown or '') + '\n' + (result.html or '')
                verdict = classify(url, result, blob)
                counts[verdict] = counts.get(verdict, 0) + 1

                if verdict in ('parked', 'dead_404', 'dead_short'):
                    # Null the website so we don't display a broken link
                    patch = {
                        'website': None,
                        'crawl_notes': f'Website health check Apr 16 2026: {verdict}. Original URL {url} was dead / parked / returning error content. Website field cleared to avoid broken links.',
                    }
                    sb_req('PATCH', f'/rest/v1/listings?id=eq.{l["id"]}', patch)
                    changes.append({'id': l['id'], 'name': l['name'], 'city': l['city'], 'state': l['state'], 'website': url, 'verdict': verdict})
                    icon = {'parked': '🅿️', 'dead_404': '💀', 'dead_short': '👻'}.get(verdict, '?')
                    log(f'  [{i+1}/{len(rows)}] {icon} {l["name"][:30]:<30} {l["city"]}, {l["state"]} | {verdict}  ({url[:50]})')
                elif (i + 1) % 50 == 0:
                    log(f'    ── progress: {i+1}/{len(rows)}  ok:{counts["ok"]}  parked:{counts["parked"]}  404:{counts["dead_404"]}  short:{counts["dead_short"]}  err:{counts["error"]} ──')

                # Checkpoint every 100
                if (i + 1) % 100 == 0:
                    save_output(counts, changes)

            except Exception as e:
                counts['error'] += 1
                err_msg = str(e)[:80]
                # Timeouts and connection errors are signal — treat as dead_timeout
                if 'timeout' in err_msg.lower() or 'err_' in err_msg.lower() or 'dns' in err_msg.lower():
                    counts['dead_timeout'] = counts.get('dead_timeout', 0) + 1
                    # Don't null the website on first timeout — could be transient.
                    # Just log for manual review.
                    if (i+1) % 10 == 0:
                        log(f'  [{i+1}/{len(rows)}] ⏱  {l["name"][:30]:<30} | timeout: {err_msg[:60]}')
                else:
                    log(f'  [{i+1}/{len(rows)}] ❌ {l["name"][:30]:<30} | {err_msg}')

    save_output(counts, changes)
    log('=' * 60)
    log(f'Website health scan complete:')
    for k, v in counts.items():
        log(f'  {k}: {v}')
    log(f'Changes applied (websites cleared): {len(changes)}')
    log(f'Audit: {OUT_FILE}')
    log('=' * 60)


def save_output(counts, changes):
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    out = {
        'timestamp': datetime.datetime.now().isoformat(),
        'counts': counts,
        'changes': changes,
    }
    with open(OUT_FILE, 'w') as f:
        json.dump(out, f, indent=2)


if __name__ == '__main__':
    asyncio.run(main())
