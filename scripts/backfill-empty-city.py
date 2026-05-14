#!/usr/bin/env python3
"""
Backfill missing city/address/zip on approved touchless listings.

Some chain listings (mostly Kwik Trip imports from their store locator)
were stored with city="", address="", zip="" — only lat/lng + place_id.
The chain detail page's ItemList JSON-LD then emits broken URLs of the
form /state/<state>//<slug> (double slash where the empty city slug
goes), which Google indexes as 404s. This script reverse-geocodes each
listing via OpenStreetMap Nominatim (free, no API key) and writes the
resolved city + road + postcode back to the database.

Run: python3 scripts/backfill-empty-city.py [--dry-run]
"""
import json, ssl, sys, time, urllib.parse, urllib.request

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

# Required by Nominatim Usage Policy. The address is informational
# (lets them contact us if we cause load); the rate-limit is 1 req/sec.
USER_AGENT = 'TouchlessCarWashFinder/1.0 (admin@touchlesscarwashfinder.com)'

DRY_RUN = '--dry-run' in sys.argv


def sb_req(method, path, body=None):
    headers = {
        'apikey': SUPABASE_ANON,
        'Authorization': f'Bearer {SUPABASE_ANON}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    req = urllib.request.Request(
        f'{SUPABASE_URL}{path}',
        data=json.dumps(body).encode() if body else None,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())


def reverse_geocode(lat, lng):
    """Return {'city': str, 'road': str, 'postcode': str} or None on failure."""
    params = urllib.parse.urlencode({
        'lat': lat,
        'lon': lng,
        'format': 'json',
        'zoom': 18,
        'addressdetails': 1,
    })
    req = urllib.request.Request(
        f'https://nominatim.openstreetmap.org/reverse?{params}',
        headers={'User-Agent': USER_AGENT},
    )
    try:
        with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as r:
            data = json.loads(r.read())
    except Exception as e:
        return None

    addr = data.get('address', {})
    # Cities can come back under different keys depending on the place
    city = (
        addr.get('city')
        or addr.get('town')
        or addr.get('village')
        or addr.get('hamlet')
        or addr.get('municipality')
        or addr.get('suburb')
        or addr.get('county')
    )
    return {
        'city': city,
        'road': addr.get('road'),
        'postcode': addr.get('postcode'),
    }


def main():
    # Load only approved + touchless listings with empty city — these are
    # the ones currently emitting broken URLs on the public site.
    rows = sb_req(
        'GET',
        '/rest/v1/listings'
        '?select=id,name,slug,state,city,address,zip,latitude,longitude'
        '&city=eq.'
        '&is_approved=eq.true'
        '&is_touchless=eq.true'
        '&latitude=not.is.null',
    )
    print(f'Loaded {len(rows)} listings with empty city (approved+touchless)')

    updated = 0
    failed = 0
    skipped = 0

    for i, row in enumerate(rows):
        lat = row['latitude']
        lng = row['longitude']
        name = row['name']
        slug = row['slug']

        result = reverse_geocode(lat, lng)
        if not result or not result.get('city'):
            print(f'  [{i+1}/{len(rows)}] ❌ {name} ({slug}) — no city in reverse-geocode')
            failed += 1
            time.sleep(1.1)
            continue

        city = result['city']
        road = result.get('road') or ''
        postcode = result.get('postcode') or ''

        # Compose a minimal address: road is fine; we don't add the city
        # because the listing page renders city/state separately.
        new_address = road if road else row['address']
        new_zip = postcode if postcode else row['zip']

        print(f'  [{i+1}/{len(rows)}] ✓ {name} ({slug}) → {city}, {row["state"]} {postcode} · {road}')

        if not DRY_RUN:
            sb_req(
                'PATCH',
                f'/rest/v1/listings?id=eq.{row["id"]}',
                {
                    'city': city,
                    'address': new_address,
                    'zip': new_zip,
                },
            )
        updated += 1

        # Nominatim usage policy: max 1 request per second
        time.sleep(1.1)

    print()
    print(f'Summary: updated={updated} failed={failed} skipped={skipped} (dry_run={DRY_RUN})')


if __name__ == '__main__':
    main()
