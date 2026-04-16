#!/usr/bin/env python3
"""
FREE review-mining via Crawl4AI against Google Maps (no API calls).

For each target listing, fetches the Google Maps search-result page, which
includes Google's own "mentioned in N reviews" keyword aggregates that appear
after reviews mentioning specific terms:
   touchless car wash 16
   brushless carwash 4
   self service car wash 20
   soft touch 3

These counts are Google's own summary of what customers say in reviews. If
"touchless car wash" count >= 3 (and no strong negative signal), that's
strong evidence the location has a touchless wash.

Also captures any actual review text snippets that appear in the page.

Uses non-headless Crawl4AI to avoid Google's bot detection. Opens a visible
browser window during the run.

Run: python3 scripts/free-gmaps-review-mine.py [--limit N]
"""
import asyncio, json, re, ssl, urllib.request, sys, os, datetime
from urllib.parse import quote

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'free-gmaps-review-mine.log')

LIMIT = 500
for arg in sys.argv[1:]:
    if arg.startswith('--limit='):
        LIMIT = int(arg.split('=')[1])


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


# Patterns Google Maps uses for keyword aggregates
# Format: "keyword_phrase N" where N is the count of reviews mentioning it
KEYWORD_PATTERNS = {
    'touchless': r'\btouchless\s+(?:car\s*)?wash\s+(\d+)\b',
    'touch_free': r'\btouch[\s-]free\s+(?:car\s*)?wash\s+(\d+)\b',
    'brushless': r'\bbrushless\s*(?:car\s*)?wash\s+(\d+)\b|\bbrushless\s+(\d+)\b',
    'laser_wash': r'\blaser\s*wash\s+(\d+)\b',
    'no_brushes': r'\bno\s+brushes?\s+(\d+)\b',
    'soft_touch': r'\bsoft\s+touch\s+(\d+)\b',
    'self_serve': r'\bself[\s-]serv(?:e|ice)?\s+(\d+)\b',
    'tunnel': r'\btunnel\s+(\d+)\b',
    'hand_wash': r'\bhand\s+wash\s+(\d+)\b',
    'automatic': r'\bautomatic\s+(\d+)\b',
    'in_bay': r'\bin[\s-]?bay\s+(\d+)\b',
}

NEGATIVE_IN_CONTEXT = re.compile(
    r'\b(?:not|isn[\u2019\']?t|wasn[\u2019\']?t)\s+(?:a\s+)?(?:touchless|touch[\s-]?free|brushless)|\bbrushes?\s+(?:touched|came\s+down|scratched|hit)|\bclaims?\s+(?:to\s+be\s+)?touchless\s+but\b',
    re.IGNORECASE,
)


def extract_signals(md):
    """Return dict of keyword → count from Google's 'mentioned in reviews' aggregates."""
    signals = {}
    for key, pattern in KEYWORD_PATTERNS.items():
        matches = re.findall(pattern, md, re.IGNORECASE)
        if matches:
            # Each match is a tuple (main, alt) or string
            counts = []
            for m in matches:
                if isinstance(m, tuple):
                    counts.extend([int(x) for x in m if x])
                else:
                    counts.append(int(m))
            if counts:
                signals[key] = max(counts)
    return signals


def extract_review_text(md):
    """Find review-like text blocks."""
    reviews = []
    lines = md.split('\n')
    for line in lines:
        line = line.strip()
        if len(line) < 40 or len(line) > 1500:
            continue
        # Must mention touchless/wash/related terms
        if not re.search(r'\b(?:touchless|touch[\s-]free|brushless|laser|wash|clean|brush|soap|vacuum|spray)\b', line, re.IGNORECASE):
            continue
        # Skip markdown nav/link rows
        if line.count('[') > 2:
            continue
        reviews.append(line)
    return reviews[:20]


def decide_touchless(signals, reviews):
    """Decide if listing is touchless based on signals + review text."""
    touchless_count = signals.get('touchless', 0) + signals.get('touch_free', 0)
    brushless_count = signals.get('brushless', 0) + signals.get('laser_wash', 0) + signals.get('no_brushes', 0)
    self_serve_count = signals.get('self_serve', 0)
    hand_wash_count = signals.get('hand_wash', 0)
    soft_touch_count = signals.get('soft_touch', 0)
    tunnel_count = signals.get('tunnel', 0)

    # Count negative mentions in review text
    neg_in_reviews = sum(1 for r in reviews if NEGATIVE_IN_CONTEXT.search(r))

    # Primary signal: touchless/brushless aggregate count
    primary = touchless_count + brushless_count
    # Opposing signal: strong self-serve/hand-wash/tunnel dominance
    opposing = self_serve_count + hand_wash_count + tunnel_count + (soft_touch_count * 2)

    if primary >= 3 and neg_in_reviews == 0 and primary >= opposing * 0.5:
        return 'touchless', primary
    if primary >= 2 and neg_in_reviews == 0 and opposing == 0:
        return 'touchless-weak', primary
    if hand_wash_count >= 2 and primary == 0:
        return 'hand-wash', 0
    if neg_in_reviews >= 2:
        return 'contradicted', neg_in_reviews
    return None, 0


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    log('=' * 60)
    log(f'FREE Google Maps Review Mining (limit={LIMIT})')
    log('=' * 60)

    # Load targets — is_touchless=false, has reviews (50+), no review_snippets yet
    log('Loading targets (is_touchless=false with 50+ reviews, not yet mined)...')
    existing_ids = set()
    offset = 0
    while True:
        rows = sb_req('GET', f'/rest/v1/review_snippets?select=listing_id&limit=1000&offset={offset}')
        if not rows: break
        for r in rows: existing_ids.add(r['listing_id'])
        if len(rows) < 1000: break
        offset += 1000
    log(f'  {len(existing_ids)} listings already mined')

    candidates = []
    offset = 0
    while True:
        rows = sb_req('GET',
            f'/rest/v1/listings?select=id,name,city,state,review_count'
            f'&is_touchless=eq.false'
            f'&review_count=gte.50'
            f'&order=review_count.desc.nullslast'
            f'&limit=1000&offset={offset}')
        if not rows: break
        for r in rows:
            if r['id'] not in existing_ids:
                candidates.append(r)
        if len(rows) < 1000 or len(candidates) >= LIMIT: break
        offset += 1000

    batch = candidates[:LIMIT]
    log(f'Processing {len(batch)} listings')

    config = BrowserConfig(
        headless=False,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport_width=1280, viewport_height=900,
    )
    run_config = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=3.0)

    stats = {'touchless': 0, 'touchless-weak': 0, 'hand-wash': 0, 'contradicted': 0, 'unclear': 0, 'errors': 0}
    promoted = []

    async with AsyncWebCrawler(config=config) as crawler:
        for i, l in enumerate(batch):
            name_safe = re.sub(r"['\"]", '', l['name'])
            query = f"{name_safe} {l.get('city','')} {l.get('state','')}".replace(' ', '+')
            url = f'https://maps.google.com/maps?q={query}&hl=en'
            try:
                result = await crawler.arun(url, config=run_config)
                md = result.markdown or ''
                if len(md) < 500:
                    stats['errors'] += 1
                    continue
                signals = extract_signals(md)
                reviews = extract_review_text(md)
                decision, score = decide_touchless(signals, reviews)
                key = decision or 'unclear'
                stats[key] = stats.get(key, 0) + 1

                # Save signals to review_snippets (as source-tag) for auditability
                snippets_to_save = []
                for r in reviews[:5]:
                    has_pos = bool(re.search(r'\btouchless|touch[\s-]free|brushless|laser\s*wash|no\s+brushes\b', r, re.IGNORECASE))
                    if has_pos:
                        is_evidence = not NEGATIVE_IN_CONTEXT.search(r)
                        snippets_to_save.append({
                            'listing_id': l['id'],
                            'review_text': r[:1200],
                            'is_touchless_evidence': is_evidence,
                            'touchless_keywords': ['touchless'],
                            'source': 'free_gmaps_scraper',
                        })

                # Save a meta "keyword aggregates" snippet so we have evidence logged
                if signals:
                    agg_text = ' | '.join([f'{k}={v}' for k, v in signals.items()])
                    snippets_to_save.append({
                        'listing_id': l['id'],
                        'review_text': f'GOOGLE_MAPS_AGGREGATES: {agg_text}',
                        'is_touchless_evidence': decision in ('touchless', 'touchless-weak'),
                        'touchless_keywords': list(signals.keys()),
                        'source': 'free_gmaps_aggregates',
                    })

                if snippets_to_save:
                    try:
                        sb_req('POST', '/rest/v1/review_snippets', snippets_to_save)
                    except Exception:
                        pass

                if decision == 'touchless':
                    promoted.append({'id': l['id'], 'name': l['name'], 'city': l['city'], 'state': l['state'], 'signals': signals, 'score': score})
                    log(f'  ✓ TOUCHLESS  {l["name"]} — {l["city"]}, {l["state"]}  (touchless:{signals.get("touchless",0)} brushless:{signals.get("brushless",0)} self:{signals.get("self_serve",0)} hand:{signals.get("hand_wash",0)})')
            except Exception as e:
                stats['errors'] += 1

            if (i + 1) % 20 == 0:
                log(f'  [{i+1}/{len(batch)}] stats={stats} promoted={len(promoted)}')

    # Promote confirmed touchless
    if promoted:
        log(f'\nPromoting {len(promoted)} confirmed touchless...')
        ids = [p['id'] for p in promoted]
        for i in range(0, len(ids), 200):
            batch_ids = ids[i:i+200]
            sb_req('PATCH', f'/rest/v1/listings?id=in.({",".join(batch_ids)})', {
                'is_touchless': True,
                'is_approved': True,
                'touchless_verified': 'user_review',
                'classification_source': 'promoted_apr16_free_gmaps_review_mine',
                'crawl_notes': 'Promoted: Google Maps "mentioned in reviews" aggregate shows 3+ reviews mention touchless/brushless/laser wash, no negatives',
            })

    log('=' * 60)
    log(f'DONE. Promoted: {len(promoted)}. Stats: {stats}')
    log('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
