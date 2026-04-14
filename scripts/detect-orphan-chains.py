#!/usr/bin/env python3
"""
Detect orphan chains — clusters of listings that should be grouped under a parent_chain
but currently aren't.

Two detection strategies:
  1. Shared website domain (strongest signal — same site = same business)
  2. Shared name prefix (for listings without websites)

Reports candidates; does NOT modify the DB. Review output and tag chains manually.

Run: python3 scripts/detect-orphan-chains.py [--min-count 5] [--include-tagged]
"""
import json, re, ssl, sys, urllib.parse, urllib.request
from collections import defaultdict
from urllib.parse import urlparse

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

# Domains to ignore (directory/aggregator sites, platform sites, not actual chains)
SKIP_DOMAINS = {
    'facebook.com', 'yelp.com', 'google.com', 'mapquest.com', 'yellowpages.com',
    'foursquare.com', 'mapsconnect.apple.com', 'instagram.com', 'bing.com',
    'tripadvisor.com', 'sites.google.com', 'business.site', 'edan.io',
    'keeq.io', 'carwash.com', 'washify.com', 'facebook.de',
}

# Very generic name prefixes that won't indicate a chain
STOPWORD_PREFIXES = {
    'car', 'the', 'auto', 'carwash', 'wash', 'quick', 'express', 'super', 'clean',
    'shine', 'sparkle', 'splash', 'spotless', 'touchless', 'touch-free', 'touch',
    'automatic', 'self', 'self-serve', 'laser', 'brushless', 'mr', 'mister',
    'ms', 'ez', 'easy', 'fast', 'soft', 'pro', 'best', 'new', 'all', 'big',
    'little', 'crystal', 'diamond', 'gold', 'star', 'blue', 'red', 'green',
    'white', 'black', 'golden', 'silver', 'aqua', 'bubbles', 'bubble',
    'magic', 'spotfree', 'spot-free', 'spot',
}


def normalize_domain(url):
    """Extract root domain from URL (strip www., query, path)."""
    if not url:
        return None
    try:
        u = url.strip().lower()
        if not u.startswith(('http://', 'https://')):
            u = 'http://' + u
        host = urlparse(u).hostname
        if not host:
            return None
        host = host.replace('www.', '')
        # Collapse known co.uk-style TLDs? Not needed for US.
        if host in SKIP_DOMAINS:
            return None
        return host
    except Exception:
        return None


def sb_get(qs):
    req = urllib.request.Request(
        SUPABASE_URL + '/rest/v1/listings?' + qs,
        headers={'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}'},
    )
    return json.loads(urllib.request.urlopen(req, context=ssl_ctx, timeout=30).read())


def fetch_all_listings(include_tagged=False):
    """Paginate through all touchless listings."""
    rows = []
    offset = 0
    while True:
        qs = (
            'select=id,name,city,state,website,parent_chain,is_touchless,rating,review_count'
            '&is_touchless=eq.true'
            f'&limit=1000&offset={offset}'
        )
        batch = sb_get(qs)
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return rows


def cluster_by_domain(listings, min_count):
    """Group listings by normalized website domain."""
    clusters = defaultdict(list)
    for li in listings:
        domain = normalize_domain(li.get('website'))
        if not domain:
            continue
        clusters[domain].append(li)

    # Filter: only clusters with min_count+ listings
    return {d: rows for d, rows in clusters.items() if len(rows) >= min_count}


def cluster_by_name_prefix(listings, min_count, n_words=2):
    """Group listings by first n_words of name (ignoring common stopwords)."""
    clusters = defaultdict(list)
    for li in listings:
        name = (li.get('name') or '').strip().lower()
        if not name:
            continue
        # Strip punctuation
        clean = re.sub(r"[^\w\s]", ' ', name)
        tokens = clean.split()
        if len(tokens) < n_words:
            continue
        # Skip if first token is a stopword
        if tokens[0] in STOPWORD_PREFIXES:
            continue
        prefix = ' '.join(tokens[:n_words])
        clusters[prefix].append(li)

    # Filter: must span 2+ cities and have min_count+ listings
    good = {}
    for prefix, rows in clusters.items():
        if len(rows) < min_count:
            continue
        cities = {(r.get('city') or '').lower() for r in rows if r.get('city')}
        if len(cities) < 2:
            continue
        good[prefix] = rows
    return good


def main():
    min_count = 5
    include_tagged = False
    for i, arg in enumerate(sys.argv):
        if arg == '--min-count' and i + 1 < len(sys.argv):
            min_count = int(sys.argv[i + 1])
        if arg == '--include-tagged':
            include_tagged = True

    print(f'Fetching all touchless listings...')
    all_listings = fetch_all_listings()
    print(f'Loaded {len(all_listings)} touchless listings\n')

    # Filter out already-tagged unless --include-tagged
    untagged = [l for l in all_listings if not l.get('parent_chain')] if not include_tagged else all_listings
    print(f'Untagged: {len(untagged)}, Tagged: {len(all_listings) - len(untagged)}\n')

    # STRATEGY 1: Shared domain
    print('=' * 80)
    print(f'STRATEGY 1: SHARED WEBSITE DOMAIN (min {min_count} untagged listings)')
    print('=' * 80)
    domain_clusters = cluster_by_domain(untagged, min_count)
    sorted_domains = sorted(domain_clusters.items(), key=lambda x: -len(x[1]))

    for domain, rows in sorted_domains:
        states = sorted({r.get('state') or '?' for r in rows})
        # Detect a likely chain name from the listings
        names = [r.get('name', '') for r in rows]
        # Find common prefix
        common = names[0].split()[0] if names else '?'
        for w_count in range(4, 0, -1):
            prefixes = [' '.join(n.split()[:w_count]) for n in names if n.split()]
            if prefixes and all(p == prefixes[0] for p in prefixes):
                common = prefixes[0]
                break

        print(f'\n📍 {domain} — {len(rows)} listings across {len(states)} states: {", ".join(states)}')
        print(f'   Likely name: "{common}"')
        for r in rows[:8]:
            rv = r.get('review_count') or 0
            rating = r.get('rating') or 0
            print(f'     • {(r.get("name") or "")[:45]:45} | {(r.get("city") or ""):18} {r.get("state"):2} | ⭐{rating} ({rv})')
        if len(rows) > 8:
            print(f'     ... and {len(rows) - 8} more')

    # STRATEGY 2: Shared name prefix (2-word)
    print('\n' + '=' * 80)
    print(f'STRATEGY 2: SHARED NAME PREFIX (min {min_count} untagged listings, 2+ cities)')
    print('=' * 80)

    # Exclude listings already in domain clusters to avoid duplicates
    domain_ids = {r['id'] for rows in domain_clusters.values() for r in rows}
    untagged_no_domain = [l for l in untagged if l['id'] not in domain_ids]

    name_clusters = cluster_by_name_prefix(untagged_no_domain, min_count, n_words=2)
    sorted_names = sorted(name_clusters.items(), key=lambda x: -len(x[1]))

    for prefix, rows in sorted_names[:30]:
        states = sorted({r.get('state') or '?' for r in rows})
        domains = sorted({normalize_domain(r.get('website')) for r in rows if normalize_domain(r.get('website'))})
        print(f'\n🔤 "{prefix}" — {len(rows)} listings across {len(states)} states: {", ".join(states)}')
        if domains:
            print(f'   Domains seen: {", ".join(list(domains)[:5])}')
        for r in rows[:6]:
            rv = r.get('review_count') or 0
            rating = r.get('rating') or 0
            print(f'     • {(r.get("name") or "")[:45]:45} | {(r.get("city") or ""):18} {r.get("state"):2} | ⭐{rating} ({rv})')
        if len(rows) > 6:
            print(f'     ... and {len(rows) - 6} more')

    # Summary
    print('\n' + '=' * 80)
    print('SUMMARY')
    print('=' * 80)
    domain_total = sum(len(r) for r in domain_clusters.values())
    name_total = sum(len(r) for r in name_clusters.values())
    print(f'Strategy 1 (domain): {len(domain_clusters)} candidate chains, {domain_total} listings')
    print(f'Strategy 2 (name):   {len(name_clusters)} candidate chains, {name_total} listings')
    print(f'Grand total: {domain_total + name_total} listings could potentially be grouped into chains')


if __name__ == '__main__':
    main()
