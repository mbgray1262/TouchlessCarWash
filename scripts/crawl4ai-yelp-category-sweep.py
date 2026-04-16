#!/usr/bin/env python3
"""
Yelp CATEGORY sweep — uses Yelp's "touchless car wash" search as a
DISCOVERY mechanism only. Validates every candidate against actual review
text; never trusts Yelp's own categorization.

Per-metro flow:
  1. Crawl Yelp search: find_desc="Touchless Car Wash" find_loc={metro}
  2. Extract all biz URLs returned
  3. Skip tunnel-chain-blocklisted domains
  4. For each biz URL, crawl the biz page → extract review text
  5. If 2+ positive touchless review snippets (and no strong negation):
     - Match against our DB by name+city
     - If in DB: save snippets, flag as touchless (held at is_approved=false)
     - If not in DB: save as new-business candidate for review

Safety gates:
  - Tunnel-chain blocklist applied (no Take 5, Whistle, Mister, etc.)
  - Require 1+ positive review snippet (passes strict keyword + negation filter)
  - Never auto-promote; new touchless flag goes with is_approved=false
  - is_approved stays false until enrichment pipeline completes (no-partial rule)

Run: python3 scripts/crawl4ai-yelp-category-sweep.py [--limit N] [--skip N]
"""
import asyncio, json, re, ssl, urllib.request, sys, os, datetime
from urllib.parse import quote

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'crawl4ai-yelp-category-sweep.log')
OUT_FILE = os.path.join(SCRIPT_DIR, 'discovery-output', 'yelp-category-sweep.json')

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


# Metros to sweep — cast wide. Roughly same list as our /best coverage,
# plus gaps the current sweeps haven't touched.
METROS = [
    ('New York', 'NY'), ('Brooklyn', 'NY'), ('Queens', 'NY'), ('Bronx', 'NY'),
    ('Buffalo', 'NY'), ('Rochester', 'NY'), ('Albany', 'NY'), ('Syracuse', 'NY'),
    ('Boston', 'MA'), ('Worcester', 'MA'), ('Springfield', 'MA'),
    ('Providence', 'RI'), ('Hartford', 'CT'),
    ('Philadelphia', 'PA'), ('Pittsburgh', 'PA'), ('Harrisburg', 'PA'),
    ('Newark', 'NJ'), ('Jersey City', 'NJ'),
    ('Baltimore', 'MD'), ('Washington', 'DC'), ('Arlington', 'VA'),
    ('Richmond', 'VA'), ('Virginia Beach', 'VA'), ('Norfolk', 'VA'),
    ('Charlotte', 'NC'), ('Raleigh', 'NC'), ('Durham', 'NC'), ('Greensboro', 'NC'),
    ('Atlanta', 'GA'), ('Savannah', 'GA'),
    ('Miami', 'FL'), ('Orlando', 'FL'), ('Tampa', 'FL'), ('Jacksonville', 'FL'),
    ('Fort Lauderdale', 'FL'),
    ('Nashville', 'TN'), ('Memphis', 'TN'), ('Chattanooga', 'TN'), ('Knoxville', 'TN'),
    ('Charleston', 'SC'), ('Columbia', 'SC'), ('Greenville', 'SC'),
    ('Louisville', 'KY'), ('Lexington', 'KY'),
    ('Birmingham', 'AL'), ('Huntsville', 'AL'), ('Mobile', 'AL'),
    ('New Orleans', 'LA'), ('Baton Rouge', 'LA'),
    ('Houston', 'TX'), ('Dallas', 'TX'), ('Austin', 'TX'), ('San Antonio', 'TX'),
    ('Fort Worth', 'TX'), ('El Paso', 'TX'),
    ('Oklahoma City', 'OK'), ('Tulsa', 'OK'),
    ('Chicago', 'IL'), ('Springfield', 'IL'), ('Rockford', 'IL'),
    ('Detroit', 'MI'), ('Grand Rapids', 'MI'), ('Ann Arbor', 'MI'),
    ('Minneapolis', 'MN'), ('St. Paul', 'MN'),
    ('Milwaukee', 'WI'), ('Madison', 'WI'), ('Green Bay', 'WI'),
    ('Cleveland', 'OH'), ('Cincinnati', 'OH'), ('Columbus', 'OH'), ('Toledo', 'OH'),
    ('Indianapolis', 'IN'), ('Fort Wayne', 'IN'),
    ('Kansas City', 'MO'), ('St. Louis', 'MO'),
    ('Des Moines', 'IA'), ('Cedar Rapids', 'IA'),
    ('Omaha', 'NE'), ('Wichita', 'KS'),
    ('Denver', 'CO'), ('Colorado Springs', 'CO'), ('Boulder', 'CO'),
    ('Salt Lake City', 'UT'), ('Albuquerque', 'NM'),
    ('Phoenix', 'AZ'), ('Tucson', 'AZ'), ('Mesa', 'AZ'),
    ('Las Vegas', 'NV'), ('Reno', 'NV'),
    ('Los Angeles', 'CA'), ('San Diego', 'CA'), ('San Jose', 'CA'),
    ('San Francisco', 'CA'), ('Oakland', 'CA'), ('Sacramento', 'CA'),
    ('Fresno', 'CA'), ('Long Beach', 'CA'), ('Anaheim', 'CA'),
    ('Portland', 'OR'), ('Eugene', 'OR'),
    ('Seattle', 'WA'), ('Spokane', 'WA'), ('Tacoma', 'WA'),
    ('Boise', 'ID'), ('Anchorage', 'AK'),
    ('Honolulu', 'HI'),
]

# Tunnel-chain domain blocklist (per memory: feedback_tunnel_chain_blocklist.md)
# Any biz URL containing one of these slugs → skip
TUNNEL_SLUG_PATTERNS = re.compile(
    r'/biz/(?:tidal-wave|whistle-express|take-5|take5|tsunami-express|mister-car|'
    r'quick-quack|tommy-s-express|tommys-express|zips-car|white-water-express|'
    r'whitewater-express|rocket-wash|american-pride-xpress|my-express-car|'
    r'quick-n-clean|xpress-lube)',
    re.IGNORECASE,
)

# Biz URL pattern on Yelp
BIZ_URL_PATTERN = re.compile(r'https?://(?:www\.)?yelp\.com/biz/([a-z0-9-]+)', re.IGNORECASE)

# Touchless keyword patterns for review text validation
POSITIVE_KEYWORDS = re.compile(
    r'\btouchless|touch[\s-]?free|brushless|no\s+brushes|laser\s*wash|'
    r'bristle[\s-]free\b',
    re.IGNORECASE,
)
NEGATIVE_CONTEXT = re.compile(
    r"\b(?:not|isn[\u2019']?t|wasn[\u2019']?t|claims?\s+to\s+be)\s+(?:really\s+|actually\s+|truly\s+)?"
    r"(?:touchless|touch[\s-]?free|brushless)|"
    r"wish\s+(?:it|this|they)\s+(?:were|was|had)\s+touchless|"
    r"brushes?\s+(?:touched|came\s+down|scratched|hit)|"
    r"supposedly\s+(?:touchless|touch[\s-]?free)",
    re.IGNORECASE,
)


def extract_biz_urls(blob):
    """All unique biz URLs from a Yelp search results page."""
    matches = BIZ_URL_PATTERN.findall(blob)
    seen, out = set(), []
    for slug in matches:
        if slug in seen: continue
        seen.add(slug)
        out.append(f'https://www.yelp.com/biz/{slug}')
    return out


def extract_reviews_with_keywords(html):
    """Extract review-text sentences mentioning touchless keywords."""
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'&[a-z]+;', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    sentences = re.split(r'(?<=[.!?])\s+', text)
    results = []
    seen = set()
    for s in sentences:
        s = s.strip()
        if len(s) < 30 or len(s) > 800: continue
        if not POSITIVE_KEYWORDS.search(s): continue
        key = s[:80].lower()
        if key in seen: continue
        seen.add(key)
        is_evidence = not NEGATIVE_CONTEXT.search(s)
        kws = []
        for kw in ['touchless', 'touch-free', 'touch free', 'brushless', 'laser wash', 'no brushes']:
            if kw.lower() in s.lower():
                kws.append(kw)
                break
        results.append({
            'text': s[:1200],
            'is_evidence': is_evidence,
            'keywords': kws or ['touchless'],
        })
        if len(results) >= 10: break
    return results


def extract_biz_name_address(html):
    """Try to extract business name + address + city + state from Yelp biz page."""
    # Name is typically in <h1> at top of page
    h1 = re.search(r'<h1[^>]*>([^<]{3,120})</h1>', html, re.IGNORECASE)
    name = re.sub(r'\s+', ' ', h1.group(1)).strip() if h1 else None
    # Address often in schema.org PostalAddress or address tag
    addr = re.search(r'"streetAddress"\s*:\s*"([^"]+)"', html)
    city = re.search(r'"addressLocality"\s*:\s*"([^"]+)"', html)
    state = re.search(r'"addressRegion"\s*:\s*"([^"]+)"', html)
    return {
        'name': name,
        'address': addr.group(1) if addr else None,
        'city': city.group(1) if city else None,
        'state': state.group(1) if state else None,
    }


def normalize_name(s):
    return re.sub(r'[^a-z0-9]+', ' ', (s or '').lower()).strip()


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    log('=' * 60)
    log(f'Crawl4AI Yelp CATEGORY sweep (review-validated)')
    log(f'Metros={len(METROS)} LIMIT={LIMIT} SKIP={SKIP}')
    log('=' * 60)

    metros = METROS[SKIP:] if SKIP > 0 else METROS
    if LIMIT > 0:
        metros = metros[:LIMIT]
    log(f'Processing {len(metros)} metros')

    # Load DB for name/city match-up
    log('Loading DB listings for matching...')
    db_by_state = {}
    offset = 0
    while True:
        page = sb_req('GET',
            f'/rest/v1/listings?select=id,name,city,state,is_touchless,is_approved&limit=1000&offset={offset}')
        if not page: break
        for r in page:
            if not r.get('state'): continue
            key = r['state']
            if key not in db_by_state: db_by_state[key] = []
            db_by_state[key].append({
                'id': r['id'], 'norm_name': normalize_name(r['name']),
                'norm_city': normalize_name(r.get('city', '')),
                'is_touchless': r['is_touchless'], 'is_approved': r['is_approved'],
            })
        if len(page) < 1000: break
        offset += 1000
    log(f'  {sum(len(v) for v in db_by_state.values())} DB listings loaded across {len(db_by_state)} states')

    # Load existing snippets for dedup
    existing_snippets = set()
    offset = 0
    while True:
        page = sb_req('GET', f'/rest/v1/review_snippets?select=listing_id,review_text&limit=1000&offset={offset}')
        if not page: break
        for s in page:
            existing_snippets.add((s['listing_id'], (s['review_text'] or '')[:80].lower()))
        if len(page) < 1000: break
        offset += 1000
    log(f'  {len(existing_snippets)} existing snippets (for dedup)')

    config = BrowserConfig(
        headless=True,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport_width=1280, viewport_height=900,
    )
    run_config = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=2.0)

    stats = {
        'metros_processed': 0,
        'biz_pages_crawled': 0,
        'blocklisted_skipped': 0,
        'matched_existing_listings': 0,
        'matched_existing_touchless_evidence_added': 0,
        'matched_existing_not_touchless_promotion_candidates': [],
        'new_business_candidates': [],  # not in DB at all
        'snippets_saved': 0,
        'errors': 0,
    }

    async with AsyncWebCrawler(config=config) as crawler:
        consecutive_errors = 0
        for mi, (city, state) in enumerate(metros):
            log(f'[{mi+1}/{len(metros)}] ── {city}, {state} ──')
            try:
                search_url = f'https://www.yelp.com/search?find_desc={quote("Touchless Car Wash")}&find_loc={quote(f"{city}, {state}")}'
                sresult = await crawler.arun(search_url, config=run_config)
                sblob = (sresult.html or '') + '\n' + (sresult.markdown or '')
                if len(sblob) < 2000:
                    stats['errors'] += 1
                    consecutive_errors += 1
                    if consecutive_errors >= 3:
                        log(f'    ⏸  sleeping 90s (consecutive errors)')
                        await asyncio.sleep(90)
                        consecutive_errors = 0
                    continue
                consecutive_errors = 0

                biz_urls = extract_biz_urls(sblob)
                log(f'    {len(biz_urls)} biz URLs found')

                # Process up to 15 per metro (enough to capture real touchless; keeps runtime reasonable)
                for bi, biz_url in enumerate(biz_urls[:15]):
                    if TUNNEL_SLUG_PATTERNS.search(biz_url):
                        stats['blocklisted_skipped'] += 1
                        continue

                    try:
                        bresult = await crawler.arun(biz_url, config=run_config)
                        bhtml = bresult.html or ''
                        if len(bhtml) < 2000: continue
                        stats['biz_pages_crawled'] += 1

                        reviews = extract_reviews_with_keywords(bhtml)
                        positive = [r for r in reviews if r['is_evidence']]
                        # 1+ positive review is sufficient evidence — the existing
                        # POSITIVE_KEYWORDS + NEGATIVE_CONTEXT filter rejects weak
                        # and negated phrasings. is_approved=false still gates
                        # against publish until enrichment completes.
                        if len(positive) < 1:
                            continue

                        meta = extract_biz_name_address(bhtml)
                        biz_state = (meta.get('state') or state).upper()

                        # Match against DB
                        match = None
                        if meta.get('name'):
                            norm_name = normalize_name(meta['name'])
                            norm_city = normalize_name(meta.get('city', '') or city)
                            state_listings = db_by_state.get(biz_state, [])
                            for cand in state_listings:
                                # Require BOTH name and city to overlap substantially
                                if (norm_name[:8] and norm_name[:8] in cand['norm_name'] and
                                    norm_city and norm_city == cand['norm_city']):
                                    match = cand
                                    break

                        if match:
                            stats['matched_existing_listings'] += 1
                            # Save positive snippets (dedup)
                            snippets_saved_here = 0
                            for r in positive:
                                key = (match['id'], r['text'][:80].lower())
                                if key in existing_snippets: continue
                                existing_snippets.add(key)
                                try:
                                    sb_req('POST', '/rest/v1/review_snippets', {
                                        'listing_id': match['id'],
                                        'review_text': r['text'],
                                        'is_touchless_evidence': True,
                                        'touchless_keywords': r['keywords'],
                                        'source': 'yelp_category_sweep',
                                    })
                                    snippets_saved_here += 1
                                    stats['snippets_saved'] += 1
                                except Exception:
                                    pass

                            if not match['is_touchless']:
                                # Add to promotion candidates (held for review per no-partial-listings rule)
                                stats['matched_existing_not_touchless_promotion_candidates'].append({
                                    'id': match['id'],
                                    'name': meta.get('name'),
                                    'city': meta.get('city'),
                                    'state': biz_state,
                                    'yelp_url': biz_url,
                                    'positive_count': len(positive),
                                    'sample': positive[0]['text'][:300],
                                })
                            else:
                                stats['matched_existing_touchless_evidence_added'] += 1
                            log(f'    ✅ DB match: {meta.get("name","?")[:30]:<30} pos:{len(positive)} saved:{snippets_saved_here}')
                        else:
                            # Not in DB — new business candidate
                            stats['new_business_candidates'].append({
                                'yelp_url': biz_url,
                                'name': meta.get('name'),
                                'address': meta.get('address'),
                                'city': meta.get('city') or city,
                                'state': biz_state,
                                'positive_count': len(positive),
                                'sample': positive[0]['text'][:300],
                            })
                            log(f'    🆕 NEW: {meta.get("name","?")[:30]:<30} pos:{len(positive)}')
                    except Exception as e:
                        stats['errors'] += 1

                stats['metros_processed'] += 1
                save_output(stats)

            except Exception as e:
                stats['errors'] += 1
                log(f'  ❌ {city}, {state} | {str(e)[:80]}')

    save_output(stats)
    log('=' * 60)
    log(f'Yelp category sweep complete:')
    log(f'  metros_processed: {stats["metros_processed"]}')
    log(f'  biz_pages_crawled: {stats["biz_pages_crawled"]}')
    log(f'  blocklisted_skipped: {stats["blocklisted_skipped"]}')
    log(f'  matched existing listings (any): {stats["matched_existing_listings"]}')
    log(f'  evidence added to already-touchless: {stats["matched_existing_touchless_evidence_added"]}')
    log(f'  promotion candidates (in DB as not-touchless, now have reviews): {len(stats["matched_existing_not_touchless_promotion_candidates"])}')
    log(f'  NEW business candidates (not in DB): {len(stats["new_business_candidates"])}')
    log(f'  total snippets saved: {stats["snippets_saved"]}')
    log(f'  errors: {stats["errors"]}')
    log(f'Audit: {OUT_FILE}')
    log('=' * 60)


def save_output(stats):
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    out = {
        'timestamp': datetime.datetime.now().isoformat(),
        'summary': {
            'metros_processed': stats['metros_processed'],
            'biz_pages_crawled': stats['biz_pages_crawled'],
            'blocklisted_skipped': stats['blocklisted_skipped'],
            'matched_existing_listings': stats['matched_existing_listings'],
            'matched_existing_touchless_evidence_added': stats['matched_existing_touchless_evidence_added'],
            'promotion_candidates_count': len(stats['matched_existing_not_touchless_promotion_candidates']),
            'new_business_candidates_count': len(stats['new_business_candidates']),
            'snippets_saved': stats['snippets_saved'],
            'errors': stats['errors'],
        },
        'promotion_candidates': stats['matched_existing_not_touchless_promotion_candidates'],
        'new_business_candidates': stats['new_business_candidates'],
    }
    with open(OUT_FILE, 'w') as f:
        json.dump(out, f, indent=2)


if __name__ == '__main__':
    asyncio.run(main())
