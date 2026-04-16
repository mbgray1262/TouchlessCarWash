#!/usr/bin/env python3
"""
FREE Google Maps review mining via Crawl4AI (no SerpAPI/DataForSEO).

For each target listing with a google_place_id:
  1. Crawl4AI fetches https://www.google.com/maps/place/?q=place_id:XXX
  2. Scrolls the reviews panel to load more reviews
  3. Extracts review text from DOM
  4. Scans for touchless keywords + negative context
  5. Writes review_snippets rows with is_touchless_evidence flag

Targets: is_touchless=false listings with google_place_id and 50+ reviews that
don't already have review_snippets (high-value unverified pool).

Run: python3 scripts/free-review-mine.py [--limit N]
"""
import asyncio, json, re, ssl, urllib.request, sys, os, datetime
from urllib.parse import quote

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'free-review-mine.log')

LIMIT = 500
for i, arg in enumerate(sys.argv[1:]):
    if arg.startswith('--limit='):
        LIMIT = int(arg.split('=')[1])

TOUCHLESS_POSITIVE = re.compile(
    r'\btouchless\b|\btouch[\s-]free\b|\btouchfree\b|\bno[\s-]?touch\b|\blaser\s*wash\b|\blaserwash\b|\bbrushless\b|\bbrush[\s-]?free\b',
    re.IGNORECASE,
)
# Negative context — if nearby, disqualifies a positive match
NEGATIVE_CONTEXT = re.compile(
    r'\b(?:not|isn[\u2019\']?t|wasn[\u2019\']?t|aren[\u2019\']?t|don[\u2019\']?t|doesn[\u2019\']?t)\s+(?:a\s+|really\s+)?(?:touchless|touch[\s-]?free|touchfree|brushless|laser)',
    re.IGNORECASE,
)
# Strong negative — says brushes touched
STRONG_NEGATIVE = re.compile(
    r'\bbrushes?\s+(?:touched|came\s+down|scratched|hit|went\s+down)|\bhas\s+brushes|\bhad\s+brushes|\bclaims?\s+(?:to\s+be\s+)?touchless\s+but\b|\bsupposedly\s+touchless\b',
    re.IGNORECASE,
)


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


def extract_reviews_from_markdown(md):
    """Heuristic: Google Maps renders reviews as text blocks after scrolling.
    We look for text paragraphs 40-1500 chars that contain review-like language."""
    if not md:
        return []
    reviews = []
    # Split on double-newlines — blocks of text
    blocks = re.split(r'\n\s*\n', md)
    REVIEW_HINT = re.compile(r'\b(?:wash|car|service|place|staff|price|experience|time|money|quality|clean)\b', re.IGNORECASE)
    for block in blocks:
        block = block.strip()
        if len(block) < 40 or len(block) > 2000:
            continue
        # Skip markdown-heavy blocks (menus, navs)
        if block.count('[') > 3 or block.count('](') > 3:
            continue
        # Must contain wash/car-wash-related word
        if not REVIEW_HINT.search(block):
            continue
        reviews.append(block[:1500])
    return reviews[:30]


def classify_review(text):
    """Returns (is_touchless_evidence, keywords_found) or (False, []) if not touchless-related."""
    if STRONG_NEGATIVE.search(text):
        return (False, ['negative:brushes-touched'])
    # Find positive matches
    positives = TOUCHLESS_POSITIVE.findall(text)
    if not positives:
        return None  # not touchless-related at all, ignore
    # Check negative context near any positive
    for m in TOUCHLESS_POSITIVE.finditer(text):
        start, end = m.span()
        window = text[max(0, start-60):min(len(text), end+60)]
        if NEGATIVE_CONTEXT.search(window):
            return (False, ['negative-context'])
    return (True, list(set(p.lower() for p in positives)))


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    log('=' * 60)
    log(f'Free Google Maps Review Mining via Crawl4AI (limit={LIMIT})')
    log('=' * 60)

    # Load target listings
    log('Loading targets...')
    # Need listings with: google_place_id, review_count >= 50, currently is_touchless=false, no review_snippets yet
    # Get all review_snippet listing_ids first (to exclude)
    existing_snippet_ids = set()
    offset = 0
    while True:
        rows = sb_req('GET', f'/rest/v1/review_snippets?select=listing_id&limit=1000&offset={offset}')
        if not rows:
            break
        for r in rows:
            existing_snippet_ids.add(r['listing_id'])
        if len(rows) < 1000:
            break
        offset += 1000
    log(f'  {len(existing_snippet_ids)} listings already have review_snippets')

    candidates = []
    offset = 0
    while True:
        rows = sb_req('GET',
            f'/rest/v1/listings?select=id,name,city,state,google_place_id,review_count'
            f'&is_touchless=eq.false'
            f'&google_place_id=not.is.null'
            f'&review_count=gte.50'
            f'&order=review_count.desc.nullslast'
            f'&limit=1000&offset={offset}')
        if not rows:
            break
        for r in rows:
            if r['id'] not in existing_snippet_ids:
                candidates.append(r)
        if len(rows) < 1000 or len(candidates) >= LIMIT:
            break
        offset += 1000

    batch = candidates[:LIMIT]
    log(f'Processing {len(batch)} listings (out of {len(candidates)} eligible)')

    config = BrowserConfig(headless=True)
    run_config = CrawlerRunConfig(page_timeout=30000, wait_for_images=False)

    total_reviews = 0
    total_evidence = 0
    listings_with_evidence = 0

    async with AsyncWebCrawler(config=config) as crawler:
        for i, l in enumerate(batch):
            place_id = l['google_place_id']
            url = f'https://www.google.com/maps/place/?q=place_id:{place_id}'
            try:
                result = await crawler.arun(url, config=run_config)
                if not result or not result.markdown or len(result.markdown) < 200:
                    continue
                reviews = extract_reviews_from_markdown(result.markdown)
                if not reviews:
                    continue
                # Classify each review
                snippets_to_insert = []
                evidence_count = 0
                for review_text in reviews:
                    classification = classify_review(review_text)
                    if classification is None:
                        continue  # not touchless-related at all
                    is_evidence, keywords = classification
                    snippets_to_insert.append({
                        'listing_id': l['id'],
                        'review_text': review_text,
                        'is_touchless_evidence': is_evidence,
                        'touchless_keywords': keywords,
                        'source': 'crawl4ai_google_maps',
                    })
                    if is_evidence:
                        evidence_count += 1
                if snippets_to_insert:
                    try:
                        sb_req('POST', '/rest/v1/review_snippets', snippets_to_insert)
                        total_reviews += len(snippets_to_insert)
                        total_evidence += evidence_count
                        if evidence_count > 0:
                            listings_with_evidence += 1
                            log(f'  ✓ {l["name"]} — {l["city"]}, {l["state"]}  ({evidence_count}/{len(snippets_to_insert)} touchless evidence)')
                    except Exception as e:
                        pass  # dup key or insert error — skip

            except Exception as e:
                continue

            if (i + 1) % 20 == 0:
                log(f'  [{i+1}/{len(batch)}] snippets={total_reviews} evidence={total_evidence} listings_with_evidence={listings_with_evidence}')

    log('=' * 60)
    log(f'DONE. {total_reviews} review snippets inserted, {total_evidence} touchless evidence, {listings_with_evidence} listings')
    log(f'Next: run restore-review-evidence script to promote listings with 2+ evidence snippets')
    log('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
