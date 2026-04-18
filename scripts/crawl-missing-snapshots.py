#!/usr/bin/env python3
"""
Crawl approved touchless listings that are missing crawl_snapshot.

Unlike the general crawl4ai-enrich script, this:
  - Targets ONLY approved listings with no snapshot (our FP-scan gap)
  - Groups by unique URL — crawls each site once, applies to all matching listings
  - Writes snapshot so the find-soft-touch-false-positives scanner can find FPs

Usage: python3 scripts/crawl-missing-snapshots.py [--limit N]
"""
import asyncio, json, os, re, ssl, sys, datetime, urllib.request
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
SSL_CTX = ssl.create_default_context(); SSL_CTX.check_hostname=False; SSL_CTX.verify_mode=ssl.CERT_NONE

SKIP_DOMAINS = ['facebook.','yelp.','google.','instagram.','mapquest.','yellowpages.','tripadvisor.','fb.me','twitter.']
LIMIT = 0
for i, a in enumerate(sys.argv[1:], 1):
    if a == '--limit' and i < len(sys.argv)-1: LIMIT = int(sys.argv[i+1])
    elif a.startswith('--limit='): LIMIT = int(a.split('=')[1])


def log(m): print(f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {m}', flush=True)


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
        raise Exception(f'HTTP {e.code}: {e.read().decode("utf-8", errors="replace")[:200]}')


def should_skip(url):
    u = (url or '').lower()
    return not u or any(s in u for s in SKIP_DOMAINS)


async def crawl_one(crawler, url):
    try:
        r = await crawler.arun(url, config=CrawlerRunConfig(
            page_timeout=20000, delay_before_return_html=2.0,
            simulate_user=True, override_navigator=True, magic=True,
            cache_mode=CacheMode.BYPASS, verbose=False,
        ))
        if not r or not r.success: return None
        return {
            'markdown': (r.markdown or '')[:80000],  # cap size
            'text_len': len(r.markdown or ''),
            'crawled_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
    except Exception as e:
        return None


async def main():
    log('=' * 60)
    log('CRAWL MISSING SNAPSHOTS (approved listings)')
    log('=' * 60)

    # Fetch target listings
    listings = []
    offset = 0
    while True:
        rows = sb_req('GET', f'/rest/v1/listings?select=id,website&is_touchless=eq.true&is_approved=eq.true&crawl_snapshot=is.null&website=not.is.null&limit=1000&offset={offset}')
        if not rows: break
        listings.extend(rows)
        if len(rows) < 1000: break
        offset += 1000
    listings = [l for l in listings if not should_skip(l.get('website'))]
    log(f'Approved touchless without snapshot (crawlable): {len(listings)}')

    # Group by URL
    by_url = {}
    for l in listings:
        u = l['website']
        by_url.setdefault(u, []).append(l['id'])
    urls = list(by_url.keys())
    log(f'Unique URLs: {len(urls)}')
    if LIMIT > 0: urls = urls[:LIMIT]

    browser_cfg = BrowserConfig(headless=True, java_script_enabled=True, ignore_https_errors=True, verbose=False)
    stats = {'crawled': 0, 'updated': 0, 'failed': 0}

    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        sem = asyncio.Semaphore(5)  # 5 concurrent crawls

        async def process(url):
            async with sem:
                result = await crawl_one(crawler, url)
                if not result:
                    stats['failed'] += 1
                    return
                stats['crawled'] += 1
                # Apply to all listings matching this URL
                snapshot = {'markdown': result['markdown'], 'text_len': result['text_len']}
                body = {
                    'crawl_snapshot': snapshot,
                    'last_crawled_at': result['crawled_at'],
                }
                for lid in by_url[url]:
                    try:
                        sb_req('PATCH', f'/rest/v1/listings?id=eq.{lid}', body=body)
                        stats['updated'] += 1
                    except Exception as e:
                        pass
                if stats['crawled'] % 25 == 0:
                    log(f'  progress: {stats["crawled"]} crawled, {stats["updated"]} updated, {stats["failed"]} failed')

        await asyncio.gather(*(process(u) for u in urls), return_exceptions=True)

    log('=' * 60)
    log(f'COMPLETE: {stats["crawled"]} crawled, {stats["updated"]} listings updated, {stats["failed"]} failures')


if __name__ == '__main__':
    asyncio.run(main())
