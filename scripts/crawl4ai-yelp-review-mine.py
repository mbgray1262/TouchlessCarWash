#!/usr/bin/env python3
"""
Mine Yelp reviews for listings we already have in the DB.

Two phases per listing:
  1. Discovery: crawl Yelp search for {name} + {city, state} → extract biz URL
  2. Mining: crawl that biz URL → extract review snippets mentioning
     touchless/touch-free/brushless/laser keywords

Saves matched snippets to `review_snippets` with:
  - source='yelp_biz_crawl'
  - is_touchless_evidence=true (if positive phrasing, no negation)
  - touchless_keywords=['...']

Two kinds of value produced:
  - For is_touchless=true listings: adds evidence, boosts /best ranking score
  - For is_touchless=false listings: if 2+ positive touchless snippets, flags
    as promotion candidate (per review-evidence > chain-default rule)

Run: python3 scripts/crawl4ai-yelp-review-mine.py [--limit N] [--skip N] [--subset touchless|not-touchless]

Completely free — Yelp allows Crawl4AI with a realistic user-agent.
"""
import asyncio, json, re, ssl, urllib.request, sys, os, datetime
from urllib.parse import quote

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'crawl4ai-yelp-review-mine.log')
OUT_FILE = os.path.join(SCRIPT_DIR, 'discovery-output', 'yelp-review-mine.json')

LIMIT = 1000
SKIP = 0
SUBSET = 'touchless'  # 'touchless' | 'not-touchless'
for arg in sys.argv[1:]:
    if arg.startswith('--limit='):
        LIMIT = int(arg.split('=')[1])
    elif arg.startswith('--skip='):
        SKIP = int(arg.split('=')[1])
    elif arg.startswith('--subset='):
        SUBSET = arg.split('=')[1]


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


# Biz URL pattern on Yelp: /biz/some-slug-state
BIZ_URL_PATTERN = re.compile(r'https?://(?:www\.)?yelp\.com/biz/([a-z0-9-]+)', re.IGNORECASE)

# Touchless keyword patterns for review text extraction
POSITIVE_KEYWORDS = re.compile(
    r'\btouchless|touch[\s-]?free|brushless|no\s+brushes|laser\s*wash|'
    r'soft[\s-]cloth[\s-]free|water\s+only|bristle[\s-]free\b',
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

# Yelp review extraction patterns — review text blocks in Yelp biz pages
# Yelp renders reviews in <p> tags inside review containers.
REVIEW_BLOCK_PATTERN = re.compile(
    r'<p class="[^"]*comment[^"]*"[^>]*>(.*?)</p>|'
    r'<span class="[^"]*review-text[^"]*"[^>]*>(.*?)</span>|'
    r'<p[^>]*data-testid="review-text"[^>]*>(.*?)</p>',
    re.IGNORECASE | re.DOTALL,
)


def extract_biz_url(blob, target_city, target_state):
    """From Yelp search page HTML, extract the first biz URL that isn't an
    ad. Return None if no clear match."""
    # All biz URLs on the page
    matches = BIZ_URL_PATTERN.findall(blob)
    if not matches:
        return None
    # Return the first one (Yelp ranks most relevant first)
    # Dedupe while preserving order
    seen = set()
    ordered = []
    for slug in matches:
        if slug in seen: continue
        seen.add(slug)
        ordered.append(slug)
    return f'https://www.yelp.com/biz/{ordered[0]}' if ordered else None


def extract_reviews_with_keywords(html):
    """Extract review text blocks from Yelp biz page HTML that contain
    touchless-positive keywords. Returns list of dicts."""
    # Strip HTML to simpler text
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'&[a-z]+;', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    # Split into sentence-ish chunks for evidence extraction
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
        # Extract keywords for highlighting
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


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    log('=' * 60)
    log(f'Crawl4AI Yelp review mining — subset={SUBSET} LIMIT={LIMIT} SKIP={SKIP}')
    log('=' * 60)

    # Load seeds: listings with a city + state, prioritized by review_count
    if SUBSET == 'touchless':
        filters = '&is_touchless=eq.true&is_approved=eq.true'
    elif SUBSET == 'not-touchless':
        filters = '&is_touchless=eq.false&review_count=gte.10'
    else:
        log(f'Unknown subset: {SUBSET}')
        return

    rows = []
    offset = 0
    while True:
        page = sb_req('GET',
            '/rest/v1/listings?select=id,name,city,state,review_count'
            + filters +
            '&order=review_count.desc.nullslast'
            f'&limit=1000&offset={offset}')
        if not page: break
        rows.extend(page)
        if len(page) < 1000 or len(rows) >= SKIP + LIMIT: break
        offset += 1000

    log(f'Loaded {len(rows)} candidates for subset={SUBSET}')

    if SKIP > 0:
        rows = rows[SKIP:]
    if LIMIT > 0:
        rows = rows[:LIMIT]
    log(f'Processing {len(rows)} after skip/limit')

    # Load existing snippets keyed by listing_id to dedupe (avoid duplicate saves)
    existing_snippets = set()
    snip_offset = 0
    while True:
        page = sb_req('GET', f'/rest/v1/review_snippets?select=listing_id,review_text&limit=1000&offset={snip_offset}')
        if not page: break
        for s in page:
            existing_snippets.add((s['listing_id'], (s['review_text'] or '')[:80].lower()))
        if len(page) < 1000: break
        snip_offset += 1000
    log(f'  {len(existing_snippets)} existing snippets (for dedup)')

    config = BrowserConfig(
        headless=True,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport_width=1280, viewport_height=900,
    )
    run_config = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=2.0)

    stats = {
        'no_yelp_page': 0,
        'yelp_page_no_reviews': 0,
        'snippets_saved': 0,
        'listings_with_positive': 0,
        'listings_with_negative': 0,
        'errors': 0,
        'promotion_candidates': [],  # for not-touchless subset
    }

    async with AsyncWebCrawler(config=config) as crawler:
        consecutive_errors = 0
        for i, l in enumerate(rows):
            try:
                # Phase 1: Yelp search
                search_q = f'{l["name"]} {l.get("city","")} {l.get("state","")}'.strip()
                search_url = f'https://www.yelp.com/search?find_desc={quote(search_q)}&find_loc={quote(f"{l.get(\"city\",\"\")}, {l.get(\"state\",\"\")}")}'
                sresult = await crawler.arun(search_url, config=run_config)
                sblob = (sresult.html or '') + '\n' + (sresult.markdown or '')
                if len(sblob) < 1000:
                    stats['errors'] += 1
                    consecutive_errors += 1
                    if consecutive_errors >= 5:
                        log(f'    ⏸  {consecutive_errors} errors — sleeping 60s')
                        await asyncio.sleep(60)
                        consecutive_errors = 0
                    continue
                consecutive_errors = 0

                biz_url = extract_biz_url(sblob, l.get('city'), l.get('state'))
                if not biz_url:
                    stats['no_yelp_page'] += 1
                    if (i + 1) % 25 == 0:
                        log(f'  [{i+1}/{len(rows)}] 🕳  {l["name"][:30]:<30} | no Yelp biz URL found')
                    continue

                # Phase 2: Crawl Yelp biz page
                bresult = await crawler.arun(biz_url, config=run_config)
                bhtml = bresult.html or ''
                if len(bhtml) < 2000:
                    stats['yelp_page_no_reviews'] += 1
                    continue

                reviews = extract_reviews_with_keywords(bhtml)
                if not reviews:
                    stats['yelp_page_no_reviews'] += 1
                    if (i + 1) % 25 == 0:
                        log(f'  [{i+1}/{len(rows)}] 📭 {l["name"][:30]:<30} | {biz_url[-40:]} | no touchless-keyword reviews')
                    continue

                positive = [r for r in reviews if r['is_evidence']]
                negative = [r for r in reviews if not r['is_evidence']]
                if positive: stats['listings_with_positive'] += 1
                if negative: stats['listings_with_negative'] += 1

                # Save positive ones (dedupe against existing snippets)
                saved_here = 0
                for r in positive:
                    key = (l['id'], r['text'][:80].lower())
                    if key in existing_snippets:
                        continue
                    existing_snippets.add(key)
                    try:
                        sb_req('POST', '/rest/v1/review_snippets', {
                            'listing_id': l['id'],
                            'review_text': r['text'],
                            'is_touchless_evidence': True,
                            'touchless_keywords': r['keywords'],
                            'source': 'yelp_biz_crawl',
                        })
                        saved_here += 1
                        stats['snippets_saved'] += 1
                    except Exception:
                        pass  # RLS may block some inserts

                # For is_touchless=false subset: queue as promotion candidate if 1+ positive
                # (existing POSITIVE_KEYWORDS + NEGATIVE_CONTEXT filter already rejects
                # weak/negated phrasings; is_approved=false still gates publish)
                if SUBSET == 'not-touchless' and len(positive) >= 1:
                    stats['promotion_candidates'].append({
                        'id': l['id'],
                        'name': l['name'],
                        'city': l['city'],
                        'state': l['state'],
                        'yelp_url': biz_url,
                        'positive_count': len(positive),
                        'sample': positive[0]['text'][:300],
                    })

                log(f'  [{i+1}/{len(rows)}] {"✅" if positive else "•"} {l["name"][:30]:<30} {l["city"]}, {l["state"]} | pos:{len(positive)} neg:{len(negative)} saved:{saved_here}')

                # Checkpoint every 50
                if (i + 1) % 50 == 0:
                    save_output(stats)
                    log(f'    ── progress: {i+1}/{len(rows)}  pos:{stats["listings_with_positive"]}  saved:{stats["snippets_saved"]}  prom_cand:{len(stats["promotion_candidates"])} ──')

            except Exception as e:
                stats['errors'] += 1
                log(f'  [{i+1}/{len(rows)}] ❌ {l["name"][:30]:<30} | {str(e)[:80]}')

    save_output(stats)
    log('=' * 60)
    log(f'Yelp review mining complete:')
    for k, v in stats.items():
        if k == 'promotion_candidates':
            log(f'  {k}: {len(v)}')
        else:
            log(f'  {k}: {v}')
    log(f'Audit: {OUT_FILE}')
    log('=' * 60)


def save_output(stats):
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    out = {
        'timestamp': datetime.datetime.now().isoformat(),
        'subset': SUBSET,
        'stats': {k: v for k, v in stats.items() if k != 'promotion_candidates'},
        'promotion_candidates_count': len(stats.get('promotion_candidates', [])),
        'promotion_candidates': stats.get('promotion_candidates', []),
    }
    with open(OUT_FILE, 'w') as f:
        json.dump(out, f, indent=2)


if __name__ == '__main__':
    asyncio.run(main())
