#!/usr/bin/env python3
"""
Probe a list of candidate chain domains for third-party locator APIs.
Uses Crawl4AI with network capture to catch JS-loaded Storepoint/Yext calls.
"""
import asyncio, json, os, re, sys
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

# Domains to probe (from DB analysis of chains with >= 20 listings, parent_chain often null)
DOMAINS = [
    ('whitewatercw.com', 'https://whitewatercw.com/'),
    ('gocarwash.com', 'https://gocarwash.com/locations/'),
    ('superstarcarwashaz.com', 'https://locations.superstarcarwashaz.com/'),
    ('clubcarwash.com', 'https://clubcarwash.com/locations/'),
    ('bluewaveexpress.com', 'https://bluewaveexpress.com/locations/'),
    ('samsxpresscarwash.com', 'https://samsxpresscarwash.com/locations/'),
    ('luvcarwash.com', 'https://luvcarwash.com/locations/'),
    ('tommys-express.com', 'https://www.tommys-express.com/locations/'),
    ('quickquack.com', 'https://www.quickquack.com/locations/'),
    ('zipscarwash.com', 'https://www.zipscarwash.com/locations/'),
    ('mistercarwash.com', 'https://www.mistercarwash.com/locations/'),
    ('take5.com', 'https://www.take5.com/locations/'),
    ('calibercarwash.com', 'https://www.calibercarwash.com/locations/'),
    ('tidalwaveautospa.com', 'https://www.tidalwaveautospa.com/locations/'),
    ('whistleexpresscarwash.com', 'https://whistleexpresscarwash.com/locations/'),
    ('modwash.com', 'https://www.modwash.com/locations/'),
    ('elcarwash.com', 'https://elcarwash.com/locations/'),
    ('rocketstores.com', 'https://rocketstores.com/locations/'),
    ('texaco.com', 'https://www.texaco.com/station-locator'),
    ('sunoco.com', 'https://www.sunoco.com/station-locator'),
    ('76.com', 'https://www.76.com/station-finder'),
    ('exxon.com', 'https://www.exxon.com/en/locations'),
    ('conoco.com', 'https://www.conoco.com/station-finder'),
    ('speedway.com', 'https://www.speedway.com/locations'),
    ('dollargeneral.com', 'https://www.dollargeneral.com/store-directory'),
    ('napaonline.com', 'https://www.napaonline.com/en/stores'),
    ('loves.com', 'https://www.loves.com/en/locations'),
    ('ta-petro.com', 'https://www.ta-petro.com/locations/'),
    ('pilotflyingj.com', 'https://www.pilotflyingj.com/locations'),
    ('shell-us', 'https://www.shell.us/motorists/shell-station-locator.html'),
]

PATTERNS = {
    'Storepoint': re.compile(r'(?:api\.|stats-\d+\.)?storepoint\.co/v1/([a-z0-9]+)', re.I),
    'Yext': re.compile(r'(?:api|cdn|embed|locator|search-cloud-api)\.yext\.(?:com|io)', re.I),
    'Rio SEO': re.compile(r'(?:localworks|rioseo|rio-seo)\.', re.I),
    'MomentFeed / Uberall': re.compile(r'(momentfeed|uberall)\.', re.I),
    'Brandify': re.compile(r'(brandify|locatorsearch)\.', re.I),
    'Locally': re.compile(r'locally\.com', re.I),
    'SweetIQ': re.compile(r'sweetiq\.com', re.I),
    'Placeable': re.compile(r'placeable\.com', re.I),
}


async def probe(crawler, key, url):
    try:
        result = await crawler.arun(url, config=CrawlerRunConfig(
            page_timeout=30000, delay_before_return_html=5.0,
            simulate_user=True, override_navigator=True, magic=True,
            capture_network_requests=True, cache_mode=CacheMode.BYPASS, verbose=False,
            wait_for='body',
        ))
        html = (result.html or '') if result else ''
        net_urls = [(n.get('url') or '') for n in (result.network_requests or [])] if result else []
        combined = html + '\n' + '\n'.join(net_urls)
        hits = {}
        for name, pat in PATTERNS.items():
            m = pat.search(combined)
            if m: hits[name] = m.group(0)[:150]
        # Count addresses in HTML to estimate static vs dynamic data
        addr_count = len(re.findall(r'"streetAddress"\s*:\s*"', html)) + len(re.findall(r'<meta[^>]+itemprop="streetAddress"', html))
        return {'key': key, 'url': url, 'hits': hits, 'html_len': len(html), 'addr_count': addr_count}
    except Exception as e:
        return {'key': key, 'url': url, 'error': str(e)[:150], 'hits': {}}


async def main():
    browser_cfg = BrowserConfig(headless=True, java_script_enabled=True, ignore_https_errors=True, verbose=False)
    print(f'Probing {len(DOMAINS)} domains with browser + network capture...\n')
    results = []
    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        for key, url in DOMAINS:
            r = await probe(crawler, key, url)
            results.append(r)
            hits = r.get('hits', {})
            err = r.get('error')
            if err:
                print(f'❌ {key:<28} {err}')
            elif not hits:
                addr = r.get('addr_count', 0)
                extra = f' ({addr} addrs in HTML)' if addr else ''
                print(f'❓ {key:<28} no locator{extra} (html_len={r["html_len"]})')
            else:
                print(f'✅ {key:<28} → {", ".join(hits.keys())}')
                for name, detail in hits.items():
                    print(f'     {name}: {detail[:100]}')

    # Summary
    print('\n' + '='*60)
    print('SUMMARY')
    print('='*60)
    from collections import defaultdict
    by_loc = defaultdict(list)
    for r in results:
        for name, d in r.get('hits', {}).items():
            by_loc[name].append((r['key'], d))
    for name, entries in sorted(by_loc.items(), key=lambda x: -len(x[1])):
        print(f'\n{name}: {len(entries)}')
        for k, d in entries:
            print(f'  - {k}: {d[:80]}')

    with open(os.path.join(os.path.dirname(__file__), 'discovery-output', 'chain-domain-probe.json'), 'w') as f:
        json.dump(results, f, indent=2)


if __name__ == '__main__':
    asyncio.run(main())
