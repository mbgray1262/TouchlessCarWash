#!/usr/bin/env python3
"""
Browser-based chain locator detector.

Uses Crawl4AI + Playwright to execute JS on each chain's locations page
and capture network requests. This catches Storepoint/Yext/etc that only
load via client-side API calls.

Usage: python3 scripts/detect-chain-locators-browser.py
"""
import asyncio, json, os, re, sys
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

# Subset of chains — focus on major ones with unknown locators
CHAINS = [
    ('Max Car Wash', 'https://mcwash.com/#map'),       # known-good control (Storepoint)
    ('Holiday Stationstores', 'https://www.holidaystationstores.com/locations'),
    ('Sheetz', 'https://www.sheetz.com/stores'),
    ('Autowash', 'https://autowash.com/locations/'),
    ('Super Wash', 'https://www.superwash.com/locations'),
    ('Splash Car Wash', 'https://splashcarwashes.com/locations/'),
    ('Delta Sonic', 'https://deltasoniccarwash.com/locations'),
    ('Brown Bear', 'https://www.brownbear.com/locations/'),
    ('BellStores', 'https://www.bellstores.com/locations/'),
    ('Power Market', 'https://pwrmarket.com/locations/'),
    ('Elephant Car Wash', 'https://www.elephantcarwash.com/locations'),
    ('Gorilla Wash', 'https://gorillawash.com/locations'),
    ('Flagstop Car Wash', 'https://flagstopcarwash.com/locations/'),
    ('Mr. Magic Car Wash', 'https://mrmagic.com/locations'),
    ("Zappy's", 'https://zappys.com/locations'),
    ('Foam & Wash', 'https://foamandwash.com/locations'),
    ('Blue Tide Car Wash', 'https://bluetidecarwash.com/locations'),
    ('Salty Dog Car Wash', 'https://saltydogcarwash.com/locations'),
    ('Auto Spa Speedy Wash', 'https://autospaspeedywash.com/locations'),
    ("Terrible's", 'https://terriblescarwash.com/locations'),
    ('ScrubaDub', 'https://www.scrubadub.com/locations'),
    ('BP', 'https://www.bp.com/en_us/united-states/home/products-and-services/bp-car-wash.html'),
]

THIRD_PARTY_PATTERNS = {
    'Storepoint': re.compile(r'(?:api\.|stats-\d+\.|storepoint\.co)/v1/([a-z0-9]+)', re.I),
    'Yext': re.compile(r'(?:api|cdn|embed|locator)\.yext\.(?:com|io)', re.I),
    'Yext-client': re.compile(r'search-cloud-api\.yext\.com', re.I),
    'Rio SEO / Localworks': re.compile(r'(localworks|rioseo|rio-seo)\.', re.I),
    'MomentFeed': re.compile(r'momentfeed\.', re.I),
    'Uberall': re.compile(r'uberall\.', re.I),
    'Brandify / LocatorSearch': re.compile(r'(brandify|locatorsearch)\.', re.I),
    'Locally': re.compile(r'locally\.com', re.I),
    'SweetIQ': re.compile(r'sweetiq\.com', re.I),
    'Placeable': re.compile(r'placeable\.com', re.I),
}


async def probe(crawler, name, url):
    try:
        result = await crawler.arun(
            url,
            config=CrawlerRunConfig(
                page_timeout=30000, delay_before_return_html=6.0,
                simulate_user=True, override_navigator=True, magic=True,
                capture_network_requests=True,
                cache_mode=CacheMode.BYPASS,
                wait_for='body', verbose=False,
            )
        )
        hits = {}
        # Check HTML for patterns
        html = (result.html or '') if result else ''
        # Check network requests for third-party domains
        network_urls = []
        if result and result.network_requests:
            network_urls = [(n.get('url') or '') for n in result.network_requests]
        combined = html + '\n' + '\n'.join(network_urls)

        for locator, pat in THIRD_PARTY_PATTERNS.items():
            m = pat.search(combined)
            if m:
                hits[locator] = m.group(0)[:120]

        # Also check for JSON-LD
        if '"@type":"LocalBusiness"' in html or '"@type": "LocalBusiness"' in html:
            hits['JSON-LD LocalBusiness'] = 'in-html'
        if '"@type":"ConvenienceStore"' in html or '"@type": "ConvenienceStore"' in html:
            hits['JSON-LD ConvenienceStore'] = 'in-html'
        # Count unique kwiktrip-style locations
        addr_count = len(re.findall(r'"streetAddress":"', html))
        if addr_count >= 3:
            hits['Embedded streetAddress JSON'] = f'count={addr_count}'

        return {'chain': name, 'url': url, 'hits': hits, 'network_n': len(network_urls), 'html_len': len(html)}
    except Exception as e:
        return {'chain': name, 'url': url, 'error': str(e)[:150], 'hits': {}}


async def main():
    browser_cfg = BrowserConfig(headless=True, java_script_enabled=True, ignore_https_errors=True, verbose=False)

    print(f'Probing {len(CHAINS)} chains with browser...\n')
    results = []

    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        for name, url in CHAINS:
            r = await probe(crawler, name, url)
            results.append(r)
            hits = r.get('hits', {})
            if r.get('error'):
                print(f'❌ {name:<28} error: {r["error"]}')
            elif not hits:
                print(f'❓ {name:<28} no third-party locator detected (html_len={r["html_len"]})')
            else:
                print(f'✅ {name:<28} → {", ".join(hits.keys())}')
                for loc, detail in hits.items():
                    print(f'     {loc}: {detail[:80]}')

    # Summary by locator
    print('\n' + '=' * 60)
    print('SUMMARY BY LOCATOR')
    print('=' * 60)
    from collections import defaultdict
    by_locator = defaultdict(list)
    for r in results:
        for loc, detail in r.get('hits', {}).items():
            by_locator[loc].append((r['chain'], detail))
    for loc, entries in sorted(by_locator.items(), key=lambda x: -len(x[1])):
        print(f'\n{loc}: {len(entries)} chains')
        for name, d in entries:
            print(f'  - {name}  [{d[:60]}]')

    with open(os.path.join(os.path.dirname(__file__), 'discovery-output', 'chain-locators-browser.json'), 'w') as f:
        json.dump(results, f, indent=2)


if __name__ == '__main__':
    asyncio.run(main())
