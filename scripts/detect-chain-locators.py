#!/usr/bin/env python3
"""
Detect which third-party locator plugin each chain uses, so we can
scrape their location data directly via the locator's public API.

Known patterns:
  - Storepoint: api.storepoint.co/v1/{id}/locations (great — often has per-location tags)
  - Yext: api.yext.com / *.yext.com (great — has structured amenity fields)
  - Rio SEO: *.localworks.* / *.rio.*
  - MomentFeed: *.momentfeed.*
  - Uberall: uberall.com/api
  - WordPress plugins: wpsl, asl (Agile Store Locator), asl_data inline
  - Custom: look for /api/locations, /wp-json/asl/, /wp-json/wpsl/

Strategy: fetch each chain's homepage + /locations, scan for these patterns.

Usage: python3 scripts/detect-chain-locators.py [--chain CHAIN_NAME]
"""
import json, sys, os, re, ssl
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

SSL_CTX = ssl.create_default_context(); SSL_CTX.check_hostname = False; SSL_CTX.verify_mode = ssl.CERT_NONE

# Chain list with websites to probe
CHAINS = [
    ('Max Car Wash', 'https://mcwash.com/'),
    ('Holiday Stationstores', 'https://www.holidaystationstores.com/'),
    ('Kwik Trip', 'https://www.kwiktrip.com/'),
    ('BellStores', 'https://www.bellstores.com/'),
    ('Power Market', 'https://pwrmarket.com/'),
    ('Extra Mile', 'https://www.extramile.com/'),
    ('Pinnacle 365', 'https://www.pinnacle365.com/'),
    ('BP', 'https://www.bp.com/en_us/united-states.html'),
    ('Elephant Car Wash', 'https://www.elephantcarwash.com/'),
    ('Brown Bear', 'https://www.brownbear.com/'),
    ('Gorilla Wash', 'https://gorillawash.com/'),
    ('Sheetz', 'https://www.sheetz.com/'),
    ('Autowash', 'https://autowash.com/'),
    ('Super Wash', 'https://www.superwash.com/'),
    ('Splash Car Wash', 'https://splashcarwashes.com/'),
    ('Delta Sonic', 'https://deltasoniccarwash.com/'),
    ('Prestige Car Wash', 'https://prestigewash.com/'),
    ('Flagstop Car Wash', 'https://flagstopcarwash.com/'),
    ('Mr. Magic Car Wash', 'https://mrmagic.com/'),
    ("Zappy's Auto Washes", 'https://zappys.com/'),
    ('Rocky Mountain Car Wash', 'https://rockymountaincarwash.com/'),
    ('Foam & Wash', 'https://foamandwash.com/'),
    ('Blue Tide Car Wash', 'https://bluetidecarwash.com/'),
    ('Salty Dog Car Wash', 'https://saltydogcarwash.com/'),
    ('Auto Spa Speedy Wash', 'https://autospaspeedywash.com/'),
    ('Hy-Vee', 'https://www.hy-vee.com/'),
    ("Terrible's", 'https://terriblescarwash.com/'),
    ('Dirtbuster Car Wash', 'https://dirtbustercarwash.com/'),
    ('ProClean Auto Wash', 'https://procleancarwash.com/'),
    ('Power Wash USA', 'https://powerwashusa.com/'),
    ('IQ Car Wash', 'https://iqcarwash.com/'),
    ('Cascade Car Wash', 'https://cascadecarwash.com/'),
    ('Royal Rinse Car Wash', 'https://royalrinsecarwash.com/'),
    ("Splash'n Shine", 'https://splashnshine.com/'),
    ('Wooly Wash', 'https://www.woolywash.com/'),
    ('Jurassic Car Wash', 'https://jurassiccarwash.com/'),
    ('ScrubaDub', 'https://www.scrubadub.com/'),
]

# Detection patterns
DETECTORS = {
    'Storepoint': [r'api\.storepoint\.co/v1/([a-z0-9]+)', r'stats[-.\d]*\.storepoint\.co/v1/([a-z0-9]+)', r'storepoint\.co/v1/([a-z0-9]+)'],
    'Yext': [r'api\.yext\.com', r'yext\.com/s/', r'embed\.yext\.com', r'locator\.yext\.io'],
    'Rio SEO / Localworks': [r'localworks\.', r'rio-seo\.', r'rioseo\.'],
    'MomentFeed / Uberall': [r'momentfeed\.', r'uberall\.'],
    'Agile Store Locator (WP)': [r'asl_data\s*=', r'agilestorelocator', r'/wp-json/asl/'],
    'WP Store Locator (wpsl)': [r'wpsl_locator', r'/wp-json/wpsl/', r'wpslSettings'],
    'Google My Business Embed': [r'iframe[^>]+maps\.google\.com/maps.*q='],
    'Locally': [r'locally\.com/api', r'storelocator\.locally'],
    'Brandify': [r'brandify\.', r'locatorsearch\.'],
    'JSON-LD LocalBusiness (all locations)': [r'<script[^>]*application/ld\+json[^>]*>[^<]*LocalBusiness'],
}


def detect_locator(html, chain):
    hits = []
    for locator, patterns in DETECTORS.items():
        for pat in patterns:
            m = re.search(pat, html, re.I)
            if m:
                gid = m.group(1) if m.groups() else None
                hits.append({'locator': locator, 'id': gid, 'pattern': pat, 'match': m.group(0)[:120]})
                break
    return hits


def fetch(url, timeout=15):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
        })
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
            raw = r.read()
            if raw.startswith(b'\xef\xbb\xbf'): raw = raw[3:]
            return raw.decode('utf-8', errors='replace')
    except Exception as e:
        return None


def probe_chain(chain_name, base_url):
    # Try homepage + common locator paths
    paths = ['', '/locations', '/locations/', '/find-a-location', '/find-a-store', '/store-locator', '/car-wash', '/locator', '/stores']
    all_html = ''
    for p in paths[:4]:  # just homepage + first few paths — enough for detection
        url = base_url.rstrip('/') + p
        html = fetch(url)
        if html:
            all_html += '\n' + html
            if len(all_html) > 300000: break  # enough data
    if not all_html:
        return {'chain': chain_name, 'url': base_url, 'error': 'fetch failed', 'hits': []}
    hits = detect_locator(all_html, chain_name)
    return {'chain': chain_name, 'url': base_url, 'hits': hits}


def main():
    target_chain = None
    for i, a in enumerate(sys.argv[1:], 1):
        if a == '--chain' and i < len(sys.argv)-1: target_chain = sys.argv[i+1]
    chains_to_probe = [c for c in CHAINS if not target_chain or c[0] == target_chain]

    print(f'Probing {len(chains_to_probe)} chains for locator plugins...\n')
    results = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(probe_chain, name, url): name for name, url in chains_to_probe}
        for fut in as_completed(futures):
            r = fut.result()
            results.append(r)
            # Print immediately
            name = r['chain']
            hits = r.get('hits', [])
            err = r.get('error')
            if err:
                print(f'❌ {name:<32} — {err}')
            elif not hits:
                print(f'❓ {name:<32} — no locator pattern detected')
            else:
                for h in hits:
                    id_str = f' id={h["id"]}' if h.get('id') else ''
                    print(f'✅ {name:<32} → {h["locator"]}{id_str}')

    # Summary: group by locator
    print('\n' + '=' * 60)
    print('SUMMARY BY LOCATOR')
    print('=' * 60)
    from collections import defaultdict
    by_locator = defaultdict(list)
    for r in results:
        for h in r.get('hits', []):
            by_locator[h['locator']].append((r['chain'], h.get('id')))
    for loc, entries in sorted(by_locator.items(), key=lambda x: -len(x[1])):
        print(f'\n{loc}: {len(entries)} chains')
        for name, gid in entries:
            print(f'  - {name}' + (f' (id={gid})' if gid else ''))

    # Save results
    with open(os.path.join(os.path.dirname(__file__), 'discovery-output', 'chain-locators.json'), 'w') as f:
        json.dump(results, f, indent=2)


if __name__ == '__main__':
    main()
