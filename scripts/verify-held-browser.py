#!/usr/bin/env python3
"""
Held-listing verifier using CACHED evidence (no API cost).

Replicates Michael's manual QA process, but uses data we've already scraped
and stored (free) instead of re-hitting Google Maps:

  1. Gather text evidence from:
     - listings.crawl_snapshot.markdown  (Crawl4AI website scrapes from earlier)
     - review_snippets.review_text       (Google reviews mined via SerpAPI earlier)
     - listings.name
  2. Keyword scan for touchless signals:
     positive: "touch-free", "touchless", "brushless", "no brushes", "laser wash"
     negative: "isn't touchless", "soft cloth", "rotating brushes", "mitter", "hand wash"
  3. Gather photo candidates from:
     - listings.photos[] array (already stored)
     - crawl_snapshot markdown (embedded image URLs from website)
  4. Score photos (reject: logos, icons, street-view, thumbnails; prefer:
     hero-cropped uploads, facility/exterior paths, large size hints)
  5. Decide: approve / hold / revert

Zero API cost. Reads only existing DB data. Runs fast (all DB, no browser).

Usage: python3 scripts/verify-held-browser.py [--limit N] [--dry-run]
                                                [--ids id1,id2,...]
"""
import json, sys, os, re, datetime, ssl, urllib.request

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'verify-held-cached.log')

LIMIT = 0
DRY_RUN = False
IDS_ARG = None
INCLUDE_APPROVED = False  # Also process currently-approved listings to catch contra-evidence

for i, a in enumerate(sys.argv[1:], 1):
    if a == '--limit' and i < len(sys.argv)-1: LIMIT = int(sys.argv[i+1])
    elif a.startswith('--limit='): LIMIT = int(a.split('=')[1])
    elif a == '--dry-run': DRY_RUN = True
    elif a.startswith('--ids='): IDS_ARG = a.split('=',1)[1].split(',')
    elif a == '--include-approved': INCLUDE_APPROVED = True


def log(msg):
    line = f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f: f.write(line + '\n')


def sb_get(path):
    req = urllib.request.Request(
        f'{SUPABASE_URL}{path}',
        headers={'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}'},
    )
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        return json.loads(r.read())


def sb_patch(path, body):
    req = urllib.request.Request(
        f'{SUPABASE_URL}{path}',
        data=json.dumps(body).encode(),
        headers={
            'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}',
            'Content-Type': 'application/json', 'Prefer': 'return=minimal',
        },
        method='PATCH',
    )
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        return r.status


# ============ Evidence scanning ============

POSITIVE_PATTERNS = [
    re.compile(r'\btouch[- ]?(less|free)\s+(car\s+)?(wash|bay)', re.I),
    re.compile(r'\bno touch\s+(car\s+)?wash', re.I),
    re.compile(r'\bbrush[- ]?less\s+(car\s+)?wash', re.I),
    re.compile(r'\blaser\s*wash', re.I),
    re.compile(r'\b(no|without|zero)\s+brushes\b', re.I),
    re.compile(r'\btouchless\s+(automatic|bay|system)', re.I),
    re.compile(r'\bspray\s+(?:only|arch|arches)\b.{0,30}(?:no brush|touchless|touch[- ]?free)', re.I),
    re.compile(r'\bPDQ\s+(laserwash|laser\s*wash)', re.I),  # PDQ is a touchless equipment brand
    re.compile(r'\bwashtec\s+(?:softcare)?laser', re.I),
    re.compile(r'\bistobal.{0,20}touch[- ]?free', re.I),
]

NEGATIVE_PATTERNS = [
    re.compile(r"\b(isn['\u2019]?t|is not|are not|aren['\u2019]?t)\s+(a\s+)?touch[- ]?(less|free)", re.I),
    re.compile(r'\bsoft[- ]?cloth\s+(tunnel|wash|car\s+wash)', re.I),
    re.compile(r'\b(rotating|spinning)\s+brush(es)?', re.I),
    re.compile(r'\bfoam\s+(brush|wrap|curtain|mitter)', re.I),
    re.compile(r'\bmitter\s+(curtain|drape)', re.I),
    re.compile(r'\bhand[- ]?wash(ed|ing)?\s+(car|vehicle)', re.I),
    re.compile(r'\battendant.{0,30}(dried|dries|dry|hand)', re.I),
    re.compile(r'\bsoft[- ]?touch\s+(wash|bay|system|car\s+wash)', re.I),
    re.compile(r'\b(neoglide|closed[- ]?cell)\s+foam', re.I),
    re.compile(r'\bconveyor\s+(tunnel|belt)\s+(with|using)\s+(brush|cloth)', re.I),
    re.compile(r'\btunnel\s+wash', re.I),
    re.compile(r'\bself[- ]?serv(e|ice)\s+(only|bays only)\b', re.I),
]


def scan_evidence(text):
    """Return dict: {'positive': [...], 'negative': [...]} with up to 5 snippets each."""
    positive, negative = [], []
    if not text: return {'positive': positive, 'negative': negative}
    t = text[:80000]
    for pat in POSITIVE_PATTERNS:
        for m in pat.finditer(t):
            start = max(0, m.start()-50); end = min(len(t), m.end()+50)
            positive.append(t[start:end].strip().replace('\n', ' '))
            if len(positive) >= 5: break
        if len(positive) >= 5: break
    for pat in NEGATIVE_PATTERNS:
        for m in pat.finditer(t):
            start = max(0, m.start()-50); end = min(len(t), m.end()+50)
            negative.append(t[start:end].strip().replace('\n', ' '))
            if len(negative) >= 5: break
        if len(negative) >= 5: break
    return {'positive': positive, 'negative': negative}


# ============ Photo scoring ============

URL_REJECT = [
    'streetviewpixels-pa.googleapis.com', 'maps/api/streetview',
    '/avatar', 'user_avatar', '/profile',
    '/icon', '/logo', '/favicon',
    'emoji', 'sprite', 'placeholder',
    'blank.gif', 'transparent.png', '/sb/', '/markers.png',
    '.svg',  # reject SVG (usually logos/icons)
]

ALT_REJECT = ['avatar', 'icon', 'logo', 'sprite', 'emoji', 'menu', 'receipt', 'price', 'sign in', 'sign up', 'map pin', 'marker']

URL_PREFER = [
    '/facility', '/exterior', '/building', '/carwash', '/car-wash',
    '/wash', '/gallery', '/photos', '/location',
    'hero-cropped', 'hero_rehost', 'gallery_bp',
]

ALT_PREFER = ['exterior', 'facility', 'building', 'car wash', 'touchless', 'touch free', 'touch-free', 'wash bay', 'storefront']


def score_photo(url, alt=''):
    url_l = (url or '').lower()
    alt_l = (alt or '').lower()
    if not url_l or not url_l.startswith('http'): return -999
    # Hard reject
    for k in URL_REJECT:
        if k in url_l: return -100
    for k in ALT_REJECT:
        if k in alt_l: return -50

    # Thumbnail size param reject
    # e.g. =w86, =w114-h86, =s120; but NOT =w800+, =s800+
    m = re.search(r'=[ws](\d+)(?:-h(\d+))?(?:-k-no)?$', url_l)
    if m:
        w = int(m.group(1))
        if w < 400: return -40

    score = 0
    for k in URL_PREFER:
        if k in url_l: score += 10
    for k in ALT_PREFER:
        if k in alt_l: score += 15
    if '/p/af1qi' in url_l: score += 12  # Google Maps user photo (permanent URL)
    if 'supabase.co/storage' in url_l: score += 8
    if 'hero-cropped' in url_l or 'hero_rehost' in url_l: score += 25
    # URL size hint
    m2 = re.search(r'=[ws](\d+)(?:-h(\d+))?', url_l)
    if m2:
        w = int(m2.group(1))
        if w >= 1200: score += 15
        elif w >= 800: score += 10
        elif w >= 400: score += 3
    # Reject data: URLs (base64)
    if url_l.startswith('data:'): return -999
    return score


def extract_photos_from_markdown(md):
    """Extract image URLs from markdown text. Markdown format: ![alt](url)."""
    if not md: return []
    out = []
    for m in re.finditer(r'!\[([^\]]*)\]\(([^)]+)\)', md):
        alt, url = m.group(1), m.group(2).split(' ')[0]  # drop title part
        if url.startswith('http'):
            out.append({'url': url, 'alt': alt})
    return out


def pick_hero(candidates):
    """Return (best_url, scored_list). scored = sorted (score, url) descending."""
    scored = []
    for c in candidates:
        s = score_photo(c.get('url',''), c.get('alt',''))
        scored.append((s, c.get('url'), c.get('source', '')))
    # Dedupe by URL, keep highest score
    seen = {}
    for s, u, src in scored:
        if u and (u not in seen or seen[u][0] < s):
            seen[u] = (s, src)
    dedup = [(s, u, src) for u, (s, src) in seen.items()]
    dedup.sort(key=lambda x: -x[0])
    good = [(s, u, src) for s, u, src in dedup if s > 0]
    if not good: return None, dedup
    return good[0][1], dedup


# ============ Decision ============

def decide(evidence, has_photo, name_positive, is_currently_approved=False, is_chain_verified=False):
    pos = len(evidence['positive'])
    neg = len(evidence['negative'])

    # Revert thresholds — HIGHER bar when already-approved (don't undo good data lightly).
    if is_currently_approved:
        if neg >= 5: return 'revert', f'{neg} contra signals (strong, already-approved review)'
        if neg >= 4 and pos <= 1: return 'revert', f'{neg} contra vs {pos} positive (already-approved review)'
        if pos >= 1: return 'approve', f'keep-approved: pos={pos} neg={neg}'
        return 'approve', f'keep-approved: insufficient contra (pos={pos} neg={neg})'

    # Held-listing thresholds
    if neg >= 3: return 'revert', f'{neg} contra signals'
    if neg >= 2 and pos == 0: return 'revert', f'{neg} contra, 0 positive'

    # Chain-verified listings (Max Car Wash, Brown Bear, etc. with Storepoint per-location
    # touchless tag) are authoritative — approve if they have a photo and no strong contra.
    if is_chain_verified and has_photo and neg <= 1:
        return 'approve', f'chain-verified + photo + neg={neg}'

    # Strong positive
    if pos >= 3 and neg == 0: return 'approve', f'{pos} positive, 0 contra'
    if pos >= 2 and neg <= 1 and has_photo: return 'approve', f'{pos} positive, {neg} contra, has photo'
    if pos >= 1 and neg == 0 and has_photo and name_positive: return 'approve', f'{pos} positive + touchless name + photo'
    # Chain-verified without photo — stay held (need hero first)
    if is_chain_verified and not has_photo:
        return 'hold', f'chain-verified but no photo yet'

    return 'hold', f'pos={pos} neg={neg} photo={has_photo} name_touch={name_positive} chain={is_chain_verified}'


# ============ Main ============

def main():
    log('=' * 60)
    log(f'VERIFY-HELD (cached evidence) — dry_run={DRY_RUN} limit={LIMIT or "none"}')
    log('=' * 60)

    # Load held listings
    if IDS_ARG:
        held = []
        for i in range(0, len(IDS_ARG), 50):
            chunk = ','.join(IDS_ARG[i:i+50])
            rows = sb_get(f'/rest/v1/listings?select=id,name,city,state,website,hero_image,photos,crawl_snapshot,parent_chain,touchless_verified,google_photo_url&id=in.({chunk})')
            held.extend(rows or [])
    else:
        held = []
        offset = 0
        # If --include-approved: process both approved + held. Otherwise just held.
        approval_filter = '' if INCLUDE_APPROVED else '&is_approved=eq.false'
        while True:
            rows = sb_get(f'/rest/v1/listings?select=id,name,city,state,website,hero_image,photos,crawl_snapshot,parent_chain,touchless_verified,google_photo_url,is_approved&is_touchless=eq.true{approval_filter}&limit=1000&offset={offset}')
            if not rows: break
            held.extend(rows)
            if len(rows) < 1000: break
            offset += 1000

    if LIMIT > 0: held = held[:LIMIT]
    log(f'Target held: {len(held)}')

    # Bulk-load review_snippets
    review_map = {}  # listing_id -> concat review text
    ids = [l['id'] for l in held]
    for i in range(0, len(ids), 50):
        chunk = ','.join(ids[i:i+50])
        try:
            rows = sb_get(f'/rest/v1/review_snippets?select=listing_id,review_text,is_touchless_evidence&listing_id=in.({chunk})')
        except Exception as e:
            log(f'  review_snippets fetch fail for chunk {i}: {e}')
            continue
        for r in rows or []:
            if not isinstance(r, dict): continue
            lid = r['listing_id']
            txt = r.get('review_text') or ''
            review_map[lid] = review_map.get(lid, '') + '\n' + txt
    log(f'Loaded review_snippets for {len(review_map)} listings')

    stats = {'done': 0, 'errors': 0, 'actions': {}}
    today = datetime.date.today().isoformat()

    for l in held:
        lid = l['id']
        name = l.get('name') or ''
        name_short = name[:45]
        # Build combined evidence text
        snapshot_md = ''
        if l.get('crawl_snapshot'):
            if isinstance(l['crawl_snapshot'], dict):
                snapshot_md = l['crawl_snapshot'].get('markdown') or l['crawl_snapshot'].get('text') or ''
            elif isinstance(l['crawl_snapshot'], str):
                snapshot_md = l['crawl_snapshot']
        combined = f'{name}\n{snapshot_md}\n{review_map.get(lid, "")}'
        evidence = scan_evidence(combined)

        # Name-level positive signal
        name_positive = bool(re.search(r'touch[- ]?(less|free)|brushless|no touch', name, re.I))

        # Build photo candidates
        candidates = []
        for u in (l.get('photos') or []):
            candidates.append({'url': u, 'alt': '', 'source': 'stored'})
        for c in extract_photos_from_markdown(snapshot_md):
            candidates.append({'url': c['url'], 'alt': c['alt'], 'source': 'snapshot'})
        if l.get('hero_image'):
            candidates.append({'url': l['hero_image'], 'alt': '', 'source': 'existing-hero'})
        # google_photo_url is a valid page fallback — counts as "has photo"
        if l.get('google_photo_url'):
            candidates.append({'url': l['google_photo_url'], 'alt': '', 'source': 'google-photo'})

        best_photo, scored = pick_hero(candidates)
        has_photo = best_photo is not None

        is_chain_verified = (l.get('touchless_verified') == 'chain')
        action, reason = decide(evidence, has_photo, name_positive,
                                is_currently_approved=bool(l.get('is_approved')),
                                is_chain_verified=is_chain_verified)
        stats['actions'][action] = stats['actions'].get(action, 0) + 1

        patch = {}
        if action == 'approve':
            patch['is_approved'] = True
            patch['touchless_verified'] = 'text-verified'
            if best_photo:
                patch['hero_image'] = best_photo
                patch['hero_image_source'] = 'text-verified-pick'
                alts = [u for s, u, src in scored if s > 0 and u != best_photo][:5]
                if alts: patch['photos'] = alts
            pos_sample = evidence['positive'][:2]
            patch['crawl_notes'] = f'[{today}] Approved via text-verify: {reason}. Positive signal: "{pos_sample[0][:100] if pos_sample else "name"}"'
        elif action == 'revert':
            patch['is_touchless'] = False
            patch['is_approved'] = False
            patch['touchless_verified'] = None
            patch['hero_image'] = None
            patch['hero_image_source'] = None
            neg_sample = evidence['negative'][:1]
            patch['crawl_notes'] = f'[{today}] Reverted via text-verify: {reason}. Contra: "{neg_sample[0][:120] if neg_sample else "multiple"}"'
        else:  # hold
            # Still store best photo if found — helps future re-checks
            if best_photo and not l.get('hero_image'):
                patch['hero_image'] = best_photo
                patch['hero_image_source'] = 'text-verify-harvested'
                alts = [u for s, u, src in scored if s > 0 and u != best_photo][:5]
                if alts: patch['photos'] = alts
                patch['crawl_notes'] = f'[{today}] Still held but photo harvested: {reason}'

        stats['done'] += 1
        if DRY_RUN:
            log(f'  [DRY] {lid[:8]} {name_short:<45} {action:<8}  pos={len(evidence["positive"])} neg={len(evidence["negative"])} cand={len(candidates)} photo={"Y" if has_photo else "N"}')
            continue
        if patch:
            try:
                sb_patch(f'/rest/v1/listings?id=eq.{lid}', patch)
                log(f'  ✓ {lid[:8]} {name_short:<45} {action:<8}  pos={len(evidence["positive"])} neg={len(evidence["negative"])}')
            except Exception as e:
                stats['errors'] += 1
                log(f'  ❌ {lid[:8]} {name_short} patch failed: {str(e)[:100]}')

    log('=' * 60)
    log(f'COMPLETE: {stats["done"]} / {len(held)}  errors={stats["errors"]}')
    log('Actions:')
    for a, n in sorted(stats['actions'].items(), key=lambda x: -x[1]):
        log(f'  {n:>4}  {a}')
    log('=' * 60)


if __name__ == '__main__':
    main()
