#!/usr/bin/env python3
"""
FREE Google Maps review mining v3 — context-based analysis.

Rather than looking for rigid patterns, we:
  1. Capture ALL mentions of touch/brush/laser/wand/auto/self-serv/tunnel
     keywords with 80 chars of surrounding context
  2. Classify each context snippet as POS / NEG / NEUTRAL
  3. Weight Google's "mentioned in reviews" aggregates when present
  4. Score the listing: net_evidence = positive - (negative × 2)
  5. Save interesting contexts as review_snippets
  6. Promote if net evidence is clearly positive

Non-headless Crawl4AI to bypass Google bot detection.

Run: python3 scripts/free-gmaps-context-miner.py [--limit N]
"""
import asyncio, json, re, ssl, urllib.request, sys, os, datetime
ssl_ctx = ssl.create_default_context(); ssl_ctx.check_hostname = False; ssl_ctx.verify_mode = ssl.CERT_NONE
SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'free-gmaps-context-miner.log')
LIMIT = 200
for arg in sys.argv[1:]:
    if arg.startswith('--limit='): LIMIT = int(arg.split('=')[1])

def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S'); line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f: f.write(line + '\n')

def sb_req(method, path, body=None):
    headers = {'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}', 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
    req = urllib.request.Request(f'{SUPABASE_URL}{path}', data=json.dumps(body).encode() if body else None, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r: return json.loads(r.read())

# Broad keyword families
BROAD_RE = re.compile(r'\b(touch\w*|brush\w*|laser\w*|wand\w*|automat\w*|self[\s-]?serv\w*|tunnel|hand[\s-]?wash|foam|soft[\s-]?cloth|full[\s-]?service|in[\s-]?bay|rollover|gantry)', re.IGNORECASE)

# Google's "mentioned in reviews" aggregates: "touchless car wash 21"
AGG_PATTERNS = {
    'touchless_wash': r'touchless\s+(?:car\s*)?wash\s+(\d+)',
    'touch_free_wash': r'touch[\s-]free\s+(?:car\s*)?wash\s+(\d+)',
    'brushless_wash': r'brushless\s+(?:car\s*)?wash\s+(\d+)',
    'laser_wash': r'laser\s*wash\s+(\d+)',
    'no_brushes': r'no\s+brushes?\s+(\d+)',
    'automatic_wash': r'automatic\s+wash\s+(\d+)',
    'brush_wash': r'\bbrush\s+wash\s+(\d+)',
    'soft_touch': r'soft\s+touch\s+(\d+)',
    'self_wash': r'\bself\s+wash\s+(\d+)',
    'hand_wash': r'\bhand\s+wash\s+(\d+)',
    'tunnel_wash': r'\btunnel\s+wash\s+(\d+)',
}

def extract_aggregates(md):
    out = {}
    for k, p in AGG_PATTERNS.items():
        m = re.search(p, md, re.IGNORECASE)
        if m: out[k] = int(m.group(1))
    return out

# Per-context classifier — analyze an 80-char context around a keyword
def classify_context(ctx):
    c = ctx.lower()
    # STRONG POSITIVE — compound touchless phrase, or explicit "no brushes" claim
    if re.search(r'\btouchless\s+(?:wash|car\s*wash|auto(?:matic)?)', c): return 'pos-strong'
    if re.search(r'\btouch[\s-]free\s+(?:wash|car\s*wash|auto(?:matic)?)', c): return 'pos-strong'
    if re.search(r'\bbrushless\s+(?:wash|car\s*wash|auto(?:matic)?)', c): return 'pos-strong'
    if re.search(r'\blaser\s*wash\b', c): return 'pos-strong'
    if re.search(r'\bno\s+brushes?\b(?!\s+(?:touched|scratched|cracked|came\s+down|damaged|hit|ruined|destroyed))', c): return 'pos-strong'
    if re.search(r'\bonly\s+water\s+touches\b|\bwater\s+(?:only|jet)\b', c): return 'pos-strong'
    # STRONG NEGATIVE — brushes caused damage / wash has brushes / scratched
    if re.search(r'\bbrushes?\s+(?:touched|came\s+down|scratched|cracked|damaged|ruined|destroyed|hit|went\s+down|descended|lowered)', c): return 'neg-strong'
    if re.search(r'\b(?:destroyed|ruined|cracked|scratched|damaged)\s+(?:my\s+)?(?:rims|paint|windshield|car|mirrors)', c): return 'neg-strong'
    if re.search(r'\bit[\s\u2019\']?s\s+not\s+(?:really\s+)?touchless\b|\bnot\s+(?:actually\s+)?touchless\b|\bsupposedly\s+touchless\b|\bclaims?\s+to\s+be\s+touchless\s+but', c): return 'neg-strong'
    if re.search(r'\bhas\s+brushes|\bhad\s+brushes', c): return 'neg-strong'
    if re.search(r'\b(?:soft\s+touch|soft\s+cloth|mitter|friction)\s+(?:wash|tunnel|bay)', c): return 'neg-strong'
    # WEAK POSITIVE — keyword alone, near wash context
    if re.search(r'\btouchless\b|\btouch[\s-]free\b|\btouchfree\b|\bbrushless\b', c): return 'pos-weak'
    # WEAK NEGATIVE — hand wash, full service, tunnel wash
    if re.search(r'\bhand\s*wash\b|\bfull[\s-]?service\b|\btunnel\s+wash\b', c): return 'neg-weak'
    # NEUTRAL — automatic alone, in-bay alone, etc. (could go either way)
    return 'neutral'

def score_listing(aggregates, contexts):
    # Weight Google aggregates — each count is a review mention
    agg_pos = aggregates.get('touchless_wash', 0) + aggregates.get('touch_free_wash', 0) + aggregates.get('brushless_wash', 0) + aggregates.get('laser_wash', 0) + aggregates.get('no_brushes', 0)
    agg_neg = aggregates.get('brush_wash', 0) + aggregates.get('soft_touch', 0) + aggregates.get('hand_wash', 0) + aggregates.get('tunnel_wash', 0)
    # Self-wash and automatic_wash are neutral — both types can mention

    # Context-based
    ctx_pos_strong = sum(1 for c, k in contexts if k == 'pos-strong')
    ctx_neg_strong = sum(1 for c, k in contexts if k == 'neg-strong')
    ctx_pos_weak = sum(1 for c, k in contexts if k == 'pos-weak')
    ctx_neg_weak = sum(1 for c, k in contexts if k == 'neg-weak')

    # Net score: aggregates + context (strong × 2)
    score = agg_pos - agg_neg + (ctx_pos_strong * 2) + ctx_pos_weak - (ctx_neg_strong * 3) - ctx_neg_weak
    return score, {'agg_pos': agg_pos, 'agg_neg': agg_neg, 'ctx_pos_strong': ctx_pos_strong, 'ctx_neg_strong': ctx_neg_strong, 'ctx_pos_weak': ctx_pos_weak, 'ctx_neg_weak': ctx_neg_weak}

async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
    log('=' * 60); log(f'FREE GMaps Context Miner (limit={LIMIT})'); log('=' * 60)

    existing = set()
    offset = 0
    while True:
        rows = sb_req('GET', f'/rest/v1/review_snippets?select=listing_id&limit=1000&offset={offset}')
        if not rows: break
        for r in rows: existing.add(r['listing_id'])
        if len(rows) < 1000: break
        offset += 1000

    cands = []
    offset = 0
    while True:
        rows = sb_req('GET',
            f"/rest/v1/listings?select=id,name,city,state,review_count,google_category"
            f"&is_touchless=eq.false"
            f"&review_count=gte.20"
            f"&or=(google_category.ilike.*car*wash*,google_category.ilike.*gas*station*,google_category.ilike.*convenience*store*,google_category.ilike.*detail*)"
            f"&order=review_count.desc.nullslast"
            f"&limit=1000&offset={offset}")
        if not rows: break
        for r in rows:
            if r['id'] not in existing: cands.append(r)
        if len(rows) < 1000 or len(cands) >= LIMIT: break
        offset += 1000

    batch = cands[:LIMIT]
    log(f'Processing {len(batch)} listings')

    config = BrowserConfig(headless=False, user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', viewport_width=1280, viewport_height=900)
    rc = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=3.5)
    stats = {'promote': 0, 'reject': 0, 'neutral': 0, 'errors': 0, 'no_content': 0}
    promoted = []

    async with AsyncWebCrawler(config=config) as crawler:
        for i, l in enumerate(batch):
            name_safe = re.sub(r"['\"]", '', l['name'])
            q = f"{name_safe} {l.get('city','')} {l.get('state','')}".replace(' ', '+')
            url = f'https://maps.google.com/maps?q={q}&hl=en'
            try:
                result = await crawler.arun(url, config=rc)
                md = result.markdown or ''
                if len(md) < 500: stats['no_content'] += 1; continue

                aggregates = extract_aggregates(md)

                # Capture all keyword contexts (dedup by first 100 chars)
                contexts = []
                seen = set()
                for m in BROAD_RE.finditer(md):
                    start = max(0, m.start() - 80)
                    end = min(len(md), m.end() + 80)
                    ctx = md[start:end].replace('\n', ' ').replace('\t', ' ')
                    ctx = re.sub(r'\s+', ' ', ctx).strip()
                    if ctx[:100] in seen: continue
                    seen.add(ctx[:100])
                    klass = classify_context(ctx)
                    contexts.append((ctx, klass))

                score, detail = score_listing(aggregates, contexts)

                # Save interesting snippets (pos-strong and neg-strong contexts)
                snippets_to_save = []
                for ctx, klass in contexts:
                    if klass in ('pos-strong', 'pos-weak'):
                        snippets_to_save.append({'listing_id': l['id'], 'review_text': ctx[:1200], 'is_touchless_evidence': True, 'touchless_keywords': [klass], 'source': 'gmaps_context'})
                    elif klass == 'neg-strong':
                        snippets_to_save.append({'listing_id': l['id'], 'review_text': ctx[:1200], 'is_touchless_evidence': False, 'touchless_keywords': ['negative'], 'source': 'gmaps_context'})
                # Always save an aggregates summary snippet
                if aggregates:
                    agg_text = ' | '.join(f'{k}={v}' for k, v in aggregates.items())
                    snippets_to_save.append({'listing_id': l['id'], 'review_text': f'GMAPS_AGGREGATES: {agg_text}', 'is_touchless_evidence': score >= 3, 'touchless_keywords': list(aggregates.keys()), 'source': 'gmaps_aggregates'})

                # Dedupe snippets by review_text
                seen_text = set()
                unique_snippets = []
                for s in snippets_to_save:
                    if s['review_text'][:200] in seen_text: continue
                    seen_text.add(s['review_text'][:200])
                    unique_snippets.append(s)

                if unique_snippets:
                    try: sb_req('POST', '/rest/v1/review_snippets', unique_snippets[:15])
                    except: pass

                # Decision
                if score >= 3 and detail['ctx_neg_strong'] == 0:
                    promoted.append(l['id'])
                    stats['promote'] += 1
                    log(f'  ✓ PROMOTE  [{score}] {l["name"][:38]} — {l["city"]}, {l["state"]}  agg={aggregates} ctx={detail}')
                elif detail['ctx_neg_strong'] >= 1 or score <= -3:
                    stats['reject'] += 1
                    # Don't auto-revert — already is_touchless=false, just log
                else:
                    stats['neutral'] += 1
            except Exception as e:
                stats['errors'] += 1

            if (i+1) % 20 == 0: log(f'  [{i+1}/{len(batch)}] {stats}')

    if promoted:
        for i in range(0, len(promoted), 200):
            ids = promoted[i:i+200]
            sb_req('PATCH', f'/rest/v1/listings?id=in.({",".join(ids)})', {
                'is_touchless': True, 'is_approved': True,
                'touchless_verified': 'user_review',
                'classification_source': 'promoted_apr16_gmaps_context',
                'crawl_notes': 'Promoted: Google Maps context analysis scored >=3 with no strong negative (combined aggregate counts + review context classification)',
            })

    log('='*60); log(f'DONE. Promoted: {len(promoted)}. Stats: {stats}'); log('='*60)

asyncio.run(main())
