#!/usr/bin/env python3
"""
Probe chain websites for WordPress REST API endpoints that expose location data.

Common patterns:
  /wp-json/                      — lists all registered routes
  /wp-json/wp/v2/locations       — locations as a custom post type
  /wp-json/wp/v2/stores
  /wp-json/wp/v2/types           — lists all custom post types
  /wp-json/wpgmza/v1/markers     — WP Google Maps plugin markers
  /wp-json/asl/v1/stores         — Agile Store Locator
  /wp-json/wpsl/v1/stores        — WP Store Locator
"""
import json, re, ssl, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

SSL_CTX = ssl.create_default_context(); SSL_CTX.check_hostname=False; SSL_CTX.verify_mode=ssl.CERT_NONE

# Chain websites to probe — pulled from DB + known chains
CHAINS = [
    'whitewatercw.com', 'gocarwash.com', 'clubcarwash.com', 'bluewaveexpress.com',
    'luvcarwash.com', 'tommys-express.com', 'quickquack.com',
    'mistercarwash.com', 'elcarwash.com', 'modwash.com',
    'mcwash.com', 'brownbear.com', 'scrubadub.com', 'deltasoniccarwash.com',
    'splashcarwashes.com', 'autowash.com', 'superwash.com',
    'pwrmarket.com', 'kwiktrip.com', 'holidaystationstores.com',
    'bellstores.com', 'sheetz.com', 'hyvee.com',
    'flagstopcarwash.com', 'mrmagic.com', 'zappys.com',
    'rockymountaincarwash.com', 'foamandwash.com', 'bluetidecarwash.com',
    'saltydogcarwash.com', 'autospaspeedywash.com', 'terriblescarwash.com',
    'dirtbustercarwash.com', 'procleancarwash.com', 'powerwashusa.com',
    'iqcarwash.com', 'cascadecarwash.com', 'royalrinsecarwash.com',
    'splashnshine.com', 'woolywash.com', 'jurassiccarwash.com',
    # Also try some we don't have parent_chain for but see in DB websites
    'whitewatercarwash.com', 'ricecarwash.com', 'captaincarwash.com',
    'maxcarwash.com', 'solumcarwash.com', 'ponycarwash.com',
    'dennys-auto-wash.com', 'surfsidecarwashes.com', 'fastwashbrothers.com',
    'waterworks-carwash.com', 'sudscarwash.com',
    # Car wash chains we may not have touched yet
    'fins.com', 'autobellcarwash.com', 'ducky.com', 'hoffmancarwash.com',
    'nationalcarwash.com', 'touchsupreme.com', 'rainbowcarwash.com',
    'breezethrough.com',
]

ENDPOINTS = [
    '/wp-json/',  # route list
    '/wp-json/wp/v2/types',  # post type list
    '/wp-json/wp/v2/locations',
    '/wp-json/wp/v2/location',
    '/wp-json/wp/v2/store',
    '/wp-json/wp/v2/stores',
    '/wp-json/wpgmza/v1/markers',
    '/wp-json/asl/v1/stores',
    '/wp-json/wpsl/v1/stores',
    '/wp-json/wp/v2/car-wash',
    '/wp-json/wp/v2/car-washes',
    '/wp-json/wp/v2/wash-locations',
]


def fetch(url, timeout=10):
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0','Accept':'application/json'})
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
            code = r.status
            raw = r.read()
            try:
                data = json.loads(raw)
                return {'code': code, 'data': data, 'bytes': len(raw)}
            except Exception:
                return {'code': code, 'data': None, 'bytes': len(raw), 'text': raw[:200]}
    except urllib.error.HTTPError as e:
        return {'code': e.code, 'data': None, 'bytes': 0}
    except Exception as e:
        return {'code': 0, 'error': str(e)[:100]}


def probe_chain(domain):
    base = f'https://{domain}'
    results = {}

    # First get /wp-json/ to see if WP is available + what routes exist
    root = fetch(f'{base}/wp-json/')
    if root.get('code') != 200 or not root.get('data'):
        return {'domain': domain, 'wp_available': False}

    routes = root['data'].get('routes', {})
    # Find location-like routes
    loc_routes = [r for r in routes if any(k in r.lower() for k in ['location','store','marker','wpgmza','wpsl','asl','/wp/v2/car','wash-site','wash_location'])]

    # Probe specific endpoints
    hits = {}
    for ep in ENDPOINTS:
        if ep == '/wp-json/': continue
        r = fetch(f'{base}{ep}')
        code = r.get('code', 0)
        data = r.get('data')
        if code == 200 and data is not None:
            if isinstance(data, list):
                if len(data) > 0: hits[ep] = f'array[{len(data)}]'
            elif isinstance(data, dict):
                # wpgmza markers return {"data":[...]}; wp/v2/types returns object of types
                keys = list(data.keys())[:5]
                if ep.endswith('/types'):
                    # Look for custom post types with "location" or "store" in their REST base
                    custom = [k for k in data.keys() if data[k].get('rest_base') and any(p in data[k].get('rest_base','').lower() for p in ['location','store','wash'])]
                    if custom: hits[ep] = f'custom_types={custom}'
                else:
                    # Look for data in common fields
                    for f in ['data','markers','stores','results','locations']:
                        if f in data and isinstance(data[f], list) and len(data[f]) > 0:
                            hits[ep] = f'{f}[{len(data[f])}]'
                            break

    return {
        'domain': domain,
        'wp_available': True,
        'location_routes_in_index': loc_routes[:10],
        'probe_hits': hits,
    }


def main():
    print(f'Probing {len(CHAINS)} chain domains for WP REST APIs...\n')
    results = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(probe_chain, d): d for d in CHAINS}
        for fut in as_completed(futures):
            r = fut.result()
            results.append(r)
            d = r['domain']
            if not r.get('wp_available'):
                print(f'❌ {d:<32} no WP REST API')
                continue
            lr = r.get('location_routes_in_index', [])
            hits = r.get('probe_hits', {})
            if hits:
                print(f'✅ {d:<32} {", ".join(f"{k.split(chr(47))[-1]}:{v}" for k,v in hits.items())[:120]}')
            elif lr:
                print(f'⚠  {d:<32} WP has location routes: {lr[:3]}')
            else:
                print(f'❓ {d:<32} WP available, no location endpoints found')

    # Save results
    import os
    with open(os.path.join(os.path.dirname(__file__), 'discovery-output', 'wp-api-probe.json'), 'w') as f:
        json.dump(results, f, indent=2)

    # Summary
    print('\n' + '='*60)
    print('CHAINS WITH LOCATION DATA VIA WP API:')
    print('='*60)
    for r in results:
        hits = r.get('probe_hits', {})
        if hits:
            print(f'\n{r["domain"]}:')
            for ep, sig in hits.items():
                print(f'  {ep} → {sig}')


if __name__ == '__main__':
    main()
