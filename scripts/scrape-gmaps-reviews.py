#!/usr/bin/env python3
"""
Google Maps reviews scraper using Crawl4AI's JS interaction.

For each held listing with a google_place_id but no stored review_snippets:
  1. Navigate to https://www.google.com/maps/place/?q=place_id:XXX
  2. Wait for page to render
  3. Click the "Reviews" tab
  4. Scroll the reviews pane to lazy-load more reviews
  5. Extract all review text
  6. Store in review_snippets table

Zero API cost — uses local Playwright browser via Crawl4AI.

Usage: python3 scripts/scrape-gmaps-reviews.py [--limit N] [--ids id1,id2] [--dry-run]
"""
import asyncio, json, sys, os, re, datetime, ssl, urllib.request
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'scrape-gmaps-reviews.log')

LIMIT = 0
DRY_RUN = False
IDS_ARG = None
MODE = 'held'  # 'held' | 'approved-no-reviews' | 'all-no-reviews'

for i, a in enumerate(sys.argv[1:], 1):
    if a == '--limit' and i < len(sys.argv)-1: LIMIT = int(sys.argv[i+1])
    elif a.startswith('--limit='): LIMIT = int(a.split('=')[1])
    elif a == '--dry-run': DRY_RUN = True
    elif a.startswith('--ids='): IDS_ARG = a.split('=',1)[1].split(',')
    elif a.startswith('--mode='): MODE = a.split('=',1)[1]


def log(msg):
    line = f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f: f.write(line + '\n')


def sb_req(method, path, body=None):
    headers = {
        'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}',
        'Content-Type': 'application/json',
    }
    if method in ('POST', 'PATCH'): headers['Prefer'] = 'return=minimal'
    req = urllib.request.Request(
        f'{SUPABASE_URL}{path}',
        data=json.dumps(body).encode() if body else None,
        headers=headers, method=method,
    )
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        if r.status == 204 or not r.read: return None
        try: return json.loads(r.read() or b'null')
        except: return None


# ============ JS to click Reviews tab + scroll ============

GMAPS_JS = [
    # Wait for the main app to render
    """
    await new Promise(r => setTimeout(r, 1500));
    // Find the Reviews tab. Try multiple selectors for robustness.
    const tabSelectors = [
        'button[aria-label^="Reviews for"]',
        'button[data-tab-index="1"]',
        'button[role="tab"][aria-label*="Reviews"]',
        'div[role="tab"][aria-label*="Reviews"]',
    ];
    let reviewsTab = null;
    for (const sel of tabSelectors) {
        reviewsTab = document.querySelector(sel);
        if (reviewsTab) break;
    }
    // Fallback: find any button with text "Reviews"
    if (!reviewsTab) {
        const btns = Array.from(document.querySelectorAll('button, div[role="tab"]'));
        reviewsTab = btns.find(b => /^Reviews/.test((b.innerText || '').trim()));
    }
    if (reviewsTab) reviewsTab.click();
    await new Promise(r => setTimeout(r, 2500));
    """,
    # Scroll the reviews panel multiple times to load more reviews
    """
    const scrollSelectors = [
        'div[role="main"] div[tabindex="-1"]',  // reviews scroll container
        'div[role="feed"]',
        'div.m6QErb[aria-label]',  // google's obfuscated class but aria-label is stable
    ];
    let pane = null;
    for (const sel of scrollSelectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
            if (el.scrollHeight > el.clientHeight + 100) { pane = el; break; }
        }
        if (pane) break;
    }
    // Fallback: find the tallest scrollable div on the page
    if (!pane) {
        const all = document.querySelectorAll('div');
        let best = null, bestDiff = 0;
        for (const d of all) {
            const diff = d.scrollHeight - d.clientHeight;
            if (diff > bestDiff && d.clientHeight > 200) { bestDiff = diff; best = d; }
        }
        pane = best;
    }
    if (pane) {
        for (let i = 0; i < 8; i++) {
            pane.scrollTop = pane.scrollHeight;
            await new Promise(r => setTimeout(r, 1200));
        }
    }
    """,
]


TOUCHLESS_KEYWORDS_RE = re.compile(r'touch[- ]?(less|free)|brushless|laser\s*wash|no touch|no brush', re.I)

# Negation patterns — applied to text on EITHER side of a touchless keyword.
# Also catches post-keyword negation like "touchless? No" or "touchless but actually uses".
NEGATION_BEFORE = re.compile(
    r"(?:(isn['\u2019]?t|is\s+not|was\s+not|were\s+not|are\s+not|aren['\u2019]?t|wasn['\u2019]?t|weren['\u2019]?t"
    r"|don['\u2019]?t\s+think|wouldn['\u2019]?t\s+call|hardly|barely|never|not\s+really|not\s+actually|not\s+a"
    r"|advertised\s+as|claims\s+to\s+be|says\s+it['\u2019]?s)\b.{0,25})$",
    re.I
)
NEGATION_AFTER = re.compile(
    r"^(.{0,25}(?:\?\s*[Nn]o\b|but\s+(?:not|actually|really|they|it)|however|misleading|false"
    r"|lies|scam|not\s+(?:really|actually|truly)|uses\s+(?:brush|cloth|foam|mitter)"
    r"|is\s+(?:really|actually)\s+(?:a\s+)?(?:soft|cloth|foam|tunnel|brush)))",
    re.I
)

# Explicit contra-keywords (non-touchless equipment/processes). Each match becomes
# its own negative-evidence snippet so the text-verifier sees clean contra signals.
CONTRA_KEYWORDS_RE = re.compile(
    r"\b(soft[- ]?cloth|soft[- ]?touch|mitter\s+curtain|mitter\s+drape|foam\s+(?:wrap|brush|curtain)"
    r"|rotating\s+brush(?:es)?|spinning\s+brush(?:es)?|neoglide|closed[- ]?cell\s+foam"
    r"|hand[- ]?wash(?:ed|ing)?|tunnel\s+wash|conveyor\s+belt|attendant\s+(?:dries|dried|drying))\b",
    re.I
)


def _check_negation(md, match_start, match_end):
    """Check for negation on both sides of a keyword match within 80-char windows."""
    left = md[max(0, match_start - 80):match_start]
    right = md[match_end:min(len(md), match_end + 80)]
    before_hit = NEGATION_BEFORE.search(left)
    after_hit = NEGATION_AFTER.search(right)
    return bool(before_hit or after_hit), (before_hit.group(0) if before_hit else (after_hit.group(0) if after_hit else ''))


def extract_evidence_from_markdown(md, listing_id):
    """Scan Google Maps markdown for touchless + contra keyword matches with context.

    Returns list of snippets. Each snippet is either positive (touchless keyword
    with no negation nearby) or negative (either a touchless keyword with negation,
    or a direct contra-keyword like 'soft cloth' / 'rotating brushes').
    """
    if not md: return []
    snippets = []
    seen_contexts = set()

    def _add_snippet(m, is_positive, reason_tag, md_text):
        start = max(0, m.start() - 120)
        end = min(len(md_text), m.end() + 120)
        ctx = md_text[start:end].strip().replace('\n', ' ')
        ctx = re.sub(r'\s+', ' ', ctx)
        key = ctx[:80].lower()
        if key in seen_contexts: return
        seen_contexts.add(key)
        snippets.append({
            'review_text': ctx[:1500],
            'is_touchless_evidence': is_positive,
            'negated': (not is_positive and reason_tag != 'contra-keyword'),
            'keyword': m.group(0),
            'reason': reason_tag,
        })

    # 1. Positive touchless mentions — check for negation both sides
    for m in TOUCHLESS_KEYWORDS_RE.finditer(md[:200000]):
        is_neg, neg_phrase = _check_negation(md, m.start(), m.end())
        _add_snippet(m, is_positive=(not is_neg), reason_tag=('negated:' + neg_phrase[:30] if is_neg else 'positive'), md_text=md)
        if len(snippets) >= 30: break

    # 2. Contra keywords — always stored as negative evidence
    for m in CONTRA_KEYWORDS_RE.finditer(md[:200000]):
        _add_snippet(m, is_positive=False, reason_tag='contra-keyword', md_text=md)
        if len(snippets) >= 50: break

    return snippets


async def scrape_one(crawler, listing, stats):
    lid = listing['id']
    place_id = listing.get('google_place_id')
    name_short = (listing.get('name') or '')[:40]
    if not place_id:
        stats['no_place_id'] += 1
        return

    url = f'https://www.google.com/maps/place/?q=place_id:{place_id}'
    try:
        result = await crawler.arun(
            url,
            config=CrawlerRunConfig(
                page_timeout=45000,
                delay_before_return_html=2.0,
                js_code=GMAPS_JS,
                wait_for='body',
            ),
        )
        if not result or not result.success:
            stats['crawl_fail'] += 1
            log(f'  ❌ {lid[:8]} {name_short}: crawl failed')
            return
        md = result.markdown or ''
        snippets = extract_evidence_from_markdown(md, lid)

        stats['total_snippets_found'] += len(snippets)
        positive = [s for s in snippets if s['is_touchless_evidence']]
        negated = [s for s in snippets if s['negated']]
        if positive: stats['with_touchless_evidence'] += 1
        if snippets: stats['with_any_evidence'] += 1

        log(f'  ✓ {lid[:8]} {name_short:<40} snippets={len(snippets)} pos={len(positive)} neg-phrase={len(negated)}')

        if DRY_RUN: return
        if not snippets: return

        # Upsert into review_snippets using synthesized review_id per snippet
        for i, s in enumerate(snippets):
            review_id = f'gmaps-md-{lid}-{i}'  # deterministic per snippet
            body = {
                'listing_id': lid,
                'reviewer_name': 'Google Maps (scraped)',
                'rating': None,
                'review_text': s['review_text'],
                'review_id': review_id,
                'source': 'gmaps-crawl4ai-md',
                'is_touchless_evidence': s['is_touchless_evidence'],
                'touchless_keywords': [s['keyword']],
                'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }
            try:
                sb_req('POST', '/rest/v1/review_snippets?on_conflict=review_id', body=body)
            except Exception:
                pass  # duplicate — ignore
    except Exception as e:
        stats['crawl_fail'] += 1
        log(f'  ❌ {lid[:8]} {name_short}: {str(e)[:120]}')


async def main():
    log('=' * 60)
    log(f'GMAPS REVIEWS SCRAPER — dry_run={DRY_RUN} limit={LIMIT or "none"}')
    log('=' * 60)

    # Load target listings
    if IDS_ARG:
        listings = []
        for i in range(0, len(IDS_ARG), 50):
            chunk = ','.join(IDS_ARG[i:i+50])
            rows = sb_req('GET', f'/rest/v1/listings?select=id,name,google_place_id&id=in.({chunk})')
            listings.extend(rows or [])
    else:
        # Target set depends on mode
        if MODE == 'approved-no-reviews':
            approved_filter = 'is_approved=eq.true'
            log_label = 'Approved'
        elif MODE == 'all-no-reviews':
            approved_filter = ''  # touchless true, any approval state
            log_label = 'All touchless'
        else:  # default: held
            approved_filter = 'is_approved=eq.false'
            log_label = 'Held'

        held = []
        offset = 0
        while True:
            filter_q = f'&{approved_filter}' if approved_filter else ''
            rows = sb_req('GET', f'/rest/v1/listings?select=id,name,google_place_id&is_touchless=eq.true{filter_q}&google_place_id=not.is.null&limit=1000&offset={offset}')
            if not rows: break
            held.extend(rows)
            if len(rows) < 1000: break
            offset += 1000
        log(f'{log_label} with place_id: {len(held)}')

        # Filter out ones already having stored reviews
        existing = set()
        ids = [l['id'] for l in held]
        for i in range(0, len(ids), 50):
            chunk = ','.join(ids[i:i+50])
            rows = sb_req('GET', f'/rest/v1/review_snippets?select=listing_id&listing_id=in.({chunk})')
            for r in rows or []:
                if isinstance(r, dict): existing.add(r['listing_id'])
        listings = [l for l in held if l['id'] not in existing]
        log(f'After skipping {len(existing)} with existing reviews: {len(listings)} target listings')

    if LIMIT > 0: listings = listings[:LIMIT]
    log(f'Processing {len(listings)} listings')

    config = BrowserConfig(headless=True, java_script_enabled=True)
    stats = {
        'processed': 0,
        'with_any_evidence': 0,
        'with_touchless_evidence': 0,
        'total_snippets_found': 0,
        'no_place_id': 0,
        'crawl_fail': 0,
    }

    async with AsyncWebCrawler(config=config) as crawler:
        for idx, l in enumerate(listings):
            await scrape_one(crawler, l, stats)
            stats['processed'] += 1
            if idx % 20 == 0 and idx > 0:
                log(f'  -- progress {idx}/{len(listings)} reviews_found={stats["total_reviews_found"]} --')
            # Polite 2 sec delay
            await asyncio.sleep(2)

    log('=' * 60)
    log(f'COMPLETE: {stats["processed"]}/{len(listings)}')
    log(f'  with_any_evidence:      {stats["with_any_evidence"]}')
    log(f'  with_touchless_evidence:{stats["with_touchless_evidence"]}')
    log(f'  total_snippets_found:   {stats["total_snippets_found"]}')
    log(f'  crawl_failures:         {stats["crawl_fail"]}')
    log('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
