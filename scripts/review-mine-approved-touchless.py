#!/usr/bin/env python3
"""
Review-mine approved-touchless listings that have ZERO review snippets
backing the classification. Strengthens evidence OR surfaces contradictions.

Approach:
  1. Target: is_touchless=true AND is_approved=true AND has google_place_id
     AND no existing review_snippets
  2. For each: crawl maps.google.com/place/?q=place_id: → extract
     Google's keyword aggregates ("touchless car wash 12") + any review
     text visible in markdown
  3. Save ALL extracted evidence (positive + negative) to review_snippets
  4. Do NOT auto-reclassify — just record evidence for later audit
  5. Separate audit pass (revert-classification-conflicts.mjs) can flag
     listings where evidence contradicts current classification

Run: python3 scripts/review-mine-approved-touchless.py [--limit N]
"""
import asyncio, json, re, ssl, urllib.request, sys, os, datetime

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'review-mine-approved-touchless.log')

LIMIT = 0  # 0 = no limit
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


# Google Maps "mentioned in reviews" keyword aggregate patterns
KEYWORD_AGGREGATES = {
    'touchless':  r'\btouchless\s+(?:car\s*)?wash\s+(\d+)\b',
    'touch_free': r'\btouch[\s-]free\s+(?:car\s*)?wash\s+(\d+)\b',
    'brushless':  r'\bbrushless\s*(?:car\s*)?wash\s+(\d+)\b|\bbrushless\s+(\d+)\b',
    'laser_wash': r'\blaser\s*wash\s+(\d+)\b',
    'no_brushes': r'\bno\s+brushes?\s+(\d+)\b',
    'self_serve': r'\bself[\s-]serv(?:e|ice)?\s+(\d+)\b',
    'tunnel':     r'\btunnel\s+(\d+)\b',
    'hand_wash':  r'\bhand\s+wash\s+(\d+)\b',
    'soft_touch': r'\bsoft\s+touch\s+(\d+)\b',
}

POSITIVE_KEYWORDS = re.compile(
    r'\btouchless|touch[\s-]?free|brushless|no\s+brushes|laser\s*wash\b',
    re.IGNORECASE,
)
NEGATIVE_CONTEXT = re.compile(
    r"\b(?:not|isn[\u2019']?t|wasn[\u2019']?t|claims?\s+to\s+be)\s+(?:really\s+|actually\s+|truly\s+)?"
    r"(?:touchless|touch[\s-]?free|brushless)|"
    r"wish\s+(?:it|this|they)\s+(?:were|was|had)\s+touchless|"
    r"brushes?\s+(?:touched|came\s+down|scratched|hit|spin)|"
    r"supposedly\s+(?:touchless|touch[\s-]?free)|"
    r"machines?\s+that\s+spin|"
    r"isn[\u2019']?t\s+(?:even\s+)?(?:a\s+)?touch[\s-]?less",
    re.IGNORECASE,
)


def extract_aggregates(md):
    """Return dict of keyword→count."""
    out = {}
    for key, pat in KEYWORD_AGGREGATES.items():
        ms = re.findall(pat, md, re.IGNORECASE)
        counts = []
        for m in ms:
            if isinstance(m, tuple):
                for x in m:
                    if x: counts.append(int(x))
            else:
                counts.append(int(m))
        if counts:
            out[key] = max(counts)
    return out


def extract_review_sentences(md):
    """Find review-like sentences that mention touchless/related keywords."""
    # Split by sentence; keep those with relevant keywords
    sentences = re.split(r'(?<=[.!?])\s+', md)
    out = []
    seen = set()
    for s in sentences:
        s = s.strip()
        if len(s) < 30 or len(s) > 800: continue
        if not POSITIVE_KEYWORDS.search(s): continue
        # Skip if it looks like a markdown link / nav item
        if s.count('[') > 1 or s.count(']') > 1: continue
        key = s[:80].lower()
        if key in seen: continue
        seen.add(key)
        out.append(s)
        if len(out) >= 8: break
    return out


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    log('=' * 60)
    log('Review-mine approved-touchless listings without snippets')
    log('=' * 60)

    # Load: approved-touchless listings with google_place_id
    rows = []
    offset = 0
    while True:
        page = sb_req('GET',
            '/rest/v1/listings?select=id,name,city,state,google_place_id,parent_chain'
            '&is_touchless=eq.true&is_approved=eq.true'
            '&google_place_id=not.is.null'
            f'&limit=1000&offset={offset}')
        if not page: break
        rows.extend(page)
        if len(page) < 1000: break
        offset += 1000
    log(f'  {len(rows)} approved-touchless with place_id')

    # Load existing snippets — skip listings already mined
    existing = set()
    offset = 0
    while True:
        page = sb_req('GET', f'/rest/v1/review_snippets?select=listing_id&limit=1000&offset={offset}')
        if not page: break
        for r in page: existing.add(r['listing_id'])
        if len(page) < 1000: break
        offset += 1000
    log(f'  {len(existing)} listings already have snippets')

    targets = [r for r in rows if r['id'] not in existing]
    log(f'  → {len(targets)} listings need review mining')
    if LIMIT > 0:
        targets = targets[:LIMIT]
        log(f'  (limited to {LIMIT})')

    config = BrowserConfig(
        headless=True,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport_width=1280, viewport_height=900,
    )
    run_config = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=2.5)

    stats = {'mined': 0, 'pos_evidence': 0, 'neg_evidence': 0, 'no_signal': 0, 'errors': 0}
    contradiction_candidates = []

    async with AsyncWebCrawler(config=config) as crawler:
        consecutive_errors = 0
        for i, l in enumerate(targets):
            pid = l['google_place_id']
            url = f'https://www.google.com/maps/place/?q=place_id:{pid}'
            try:
                r = await crawler.arun(url, config=run_config)
                md = r.markdown or ''
                if len(md) < 500:
                    stats['errors'] += 1
                    consecutive_errors += 1
                    if consecutive_errors >= 5:
                        log(f'  ⏸ {consecutive_errors} errors — sleeping 60s')
                        await asyncio.sleep(60)
                        consecutive_errors = 0
                    continue
                consecutive_errors = 0

                aggregates = extract_aggregates(md)
                sentences = extract_review_sentences(md)

                snippets_to_save = []
                pos_count = 0
                neg_count = 0
                for s in sentences:
                    if NEGATIVE_CONTEXT.search(s):
                        is_evidence = False
                        neg_count += 1
                    else:
                        is_evidence = True
                        pos_count += 1
                    snippets_to_save.append({
                        'listing_id': l['id'],
                        'review_text': s[:1200],
                        'is_touchless_evidence': is_evidence,
                        'sentiment': 'negative' if not is_evidence else 'positive',
                        'touchless_keywords': ['touchless'],
                        'source': 'crawl4ai_gmaps_strengthen',
                    })

                # Save aggregate summary if any keyword aggregates present
                if aggregates:
                    agg_text = 'Google Maps "mentioned in reviews" aggregates: ' + ', '.join(f'{k}={v}' for k, v in sorted(aggregates.items(), key=lambda x: -x[1]))
                    touch_sum = aggregates.get('touchless', 0) + aggregates.get('touch_free', 0) + aggregates.get('brushless', 0) + aggregates.get('laser_wash', 0) + aggregates.get('no_brushes', 0)
                    oppose = aggregates.get('tunnel', 0) + aggregates.get('hand_wash', 0) + (aggregates.get('soft_touch', 0) * 2)
                    is_evidence = touch_sum >= 2 and touch_sum > oppose
                    snippets_to_save.append({
                        'listing_id': l['id'],
                        'review_text': agg_text,
                        'is_touchless_evidence': is_evidence,
                        'sentiment': 'positive' if is_evidence else 'neutral',
                        'touchless_keywords': list(aggregates.keys()),
                        'source': 'crawl4ai_gmaps_aggregates',
                    })

                if snippets_to_save:
                    try:
                        sb_req('POST', '/rest/v1/review_snippets', snippets_to_save)
                        stats['mined'] += 1
                        if pos_count > 0: stats['pos_evidence'] += 1
                        if neg_count > 0: stats['neg_evidence'] += 1
                    except Exception as e:
                        # RLS errors expected on some sources
                        pass
                else:
                    stats['no_signal'] += 1

                # Contradiction check: negative review OR aggregates dominated by opposing
                if neg_count > 0 or (aggregates and aggregates.get('self_serve', 0) + aggregates.get('tunnel', 0) + aggregates.get('hand_wash', 0) > aggregates.get('touchless', 0) + aggregates.get('touch_free', 0) + aggregates.get('brushless', 0)):
                    contradiction_candidates.append({
                        'id': l['id'], 'name': l['name'], 'city': l['city'], 'state': l['state'],
                        'parent_chain': l.get('parent_chain'),
                        'aggregates': aggregates, 'neg_sentences': neg_count, 'pos_sentences': pos_count,
                    })

                if (i + 1) % 25 == 0:
                    log(f'  [{i+1}/{len(targets)}] mined:{stats["mined"]}  pos:{stats["pos_evidence"]}  neg:{stats["neg_evidence"]}  contradictions:{len(contradiction_candidates)}')

                # Checkpoint every 100
                if (i + 1) % 100 == 0:
                    save_contradictions(contradiction_candidates)
            except Exception as e:
                stats['errors'] += 1
                log(f'  [{i+1}/{len(targets)}] ❌ {l["name"][:30]} | {str(e)[:80]}')

    save_contradictions(contradiction_candidates)
    log('=' * 60)
    log(f'Review mining complete:')
    for k, v in stats.items():
        log(f'  {k}: {v}')
    log(f'  contradiction_candidates: {len(contradiction_candidates)}')
    log('=' * 60)


def save_contradictions(contradictions):
    out_path = os.path.join(SCRIPT_DIR, 'discovery-output', 'review-mine-contradictions.json')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump({'timestamp': datetime.datetime.now().isoformat(),
                   'contradictions': contradictions}, f, indent=2)


if __name__ == '__main__':
    asyncio.run(main())
