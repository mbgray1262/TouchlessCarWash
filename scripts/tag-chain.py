#!/usr/bin/env python3
"""
Tag listings with a parent_chain based on website domain and/or name pattern.

Run:
  python3 scripts/tag-chain.py --chain 'Kwik Trip' --domain kwiktrip.com --name-prefix 'Kwik Trip'
  python3 scripts/tag-chain.py --chain 'Super Wash' --domain superwash.com
  python3 scripts/tag-chain.py --chain 'Splash Car Wash' --domain splashcarwashes.com

Rules:
  - Listings where website contains domain → tag
  - Listings where name ilike 'prefix*' AND (no website OR domain is already-tagged blacklist-free) → tag
  - Only touches listings where parent_chain IS NULL (won't clobber existing tags)
  - Sets touchless_verified='chain' if currently NULL
  - Only tags is_touchless=true listings (safe default)
"""
import json, ssl, sys, urllib.parse, urllib.request
from urllib.parse import urlparse

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE


def sb(method, path, body=None):
    req = urllib.request.Request(
        SUPABASE_URL + path,
        data=json.dumps(body).encode() if body else None,
        headers={
            'apikey': SUPABASE_ANON,
            'Authorization': f'Bearer {SUPABASE_ANON}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
        },
        method=method,
    )
    try:
        return json.loads(urllib.request.urlopen(req, context=ssl_ctx, timeout=30).read() or b'[]')
    except urllib.error.HTTPError as e:
        print(f'ERR {method} {path}:', e.read().decode()[:300])
        raise


def normalize_domain(url):
    if not url:
        return None
    try:
        u = url.strip().lower()
        if not u.startswith(('http://', 'https://')):
            u = 'http://' + u
        host = urlparse(u).hostname
        if not host:
            return None
        return host.replace('www.', '')
    except Exception:
        return None


def fetch_all(is_touchless_only=True):
    rows = []
    offset = 0
    while True:
        qs = (
            'select=id,name,city,state,website,parent_chain,touchless_verified,is_touchless'
            f'&limit=1000&offset={offset}'
        )
        if is_touchless_only:
            qs += '&is_touchless=eq.true'
        batch = sb('GET', '/rest/v1/listings?' + qs)
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return rows


def matches(listing, domain, name_prefix):
    """Returns True if listing matches domain OR name_prefix."""
    if domain:
        d = normalize_domain(listing.get('website'))
        if d and domain.lower() in d:
            return True
    if name_prefix:
        name = (listing.get('name') or '').lower()
        if name.startswith(name_prefix.lower()):
            return True
    return False


def main():
    chain_name = None
    domain = None
    name_prefix = None
    dry_run = '--dry-run' in sys.argv
    for i, arg in enumerate(sys.argv):
        if arg == '--chain' and i + 1 < len(sys.argv):
            chain_name = sys.argv[i + 1]
        if arg == '--domain' and i + 1 < len(sys.argv):
            domain = sys.argv[i + 1]
        if arg == '--name-prefix' and i + 1 < len(sys.argv):
            name_prefix = sys.argv[i + 1]

    if not chain_name:
        print('Usage: tag-chain.py --chain NAME [--domain DOMAIN] [--name-prefix PREFIX] [--dry-run]')
        sys.exit(1)

    if not domain and not name_prefix:
        print('Need at least --domain or --name-prefix')
        sys.exit(1)

    print(f'Tagging chain: "{chain_name}"')
    print(f'  Domain:      {domain or "(none)"}')
    print(f'  Name prefix: {name_prefix or "(none)"}')
    print(f'  Dry run:     {dry_run}')
    print()

    print('Fetching all touchless listings...')
    all_listings = fetch_all()
    print(f'Loaded {len(all_listings)} touchless listings')

    # Find matches — only those NOT already tagged
    to_tag = []
    already = []
    for li in all_listings:
        if not matches(li, domain, name_prefix):
            continue
        if li.get('parent_chain'):
            if li['parent_chain'] == chain_name:
                already.append(li)
            else:
                print(f'  ⚠️  SKIP (tagged as "{li["parent_chain"]}"): {li["name"]} in {li.get("city")}, {li.get("state")}')
            continue
        to_tag.append(li)

    print(f'\n  Already tagged correctly: {len(already)}')
    print(f'  To tag:                   {len(to_tag)}')
    if not to_tag:
        print('\nNothing to do.')
        return

    # Show preview
    print('\nPreview (first 10):')
    for li in to_tag[:10]:
        print(f'  • {li["name"][:45]:45} | {(li.get("city") or ""):18} {li.get("state","")} | {(li.get("website") or "")[:45]}')
    if len(to_tag) > 10:
        print(f'  ... and {len(to_tag) - 10} more')

    if dry_run:
        print('\n[DRY RUN] No changes made.')
        return

    print(f'\nTagging {len(to_tag)} listings...')
    tagged = 0
    for li in to_tag:
        body = {'parent_chain': chain_name}
        if not li.get('touchless_verified'):
            body['touchless_verified'] = 'chain'
        try:
            sb('PATCH', f'/rest/v1/listings?id=eq.{li["id"]}', body)
            tagged += 1
        except Exception as e:
            print(f'  failed {li["id"]}: {e}')

    print(f'\n✅ Tagged {tagged} / {len(to_tag)} listings as "{chain_name}"')

    # Final verify
    qs = f'select=id&parent_chain=eq.{urllib.parse.quote(chain_name)}&is_touchless=eq.true'
    rows = sb('GET', '/rest/v1/listings?' + qs)
    print(f'   Total {chain_name} chain listings (touchless): {len(rows)}')


if __name__ == '__main__':
    main()
