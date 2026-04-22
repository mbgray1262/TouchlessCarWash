#!/usr/bin/env python3
"""
Auto-enforcement driver: runs AI audit (Gemini 2.5 Pro) on every touchless
listing and AUTOMATICALLY applies the decision to the DB. No human review.

Rules (per Michael 2026-04-17):
  - verdict=NOT_TOUCHLESS (any conf)        -> revert: is_touchless=false, is_approved=false
  - verdict=UNCERTAIN                       -> hold: is_approved=false, hero_image=null
  - verdict=CONFIRMED/PROBABLE + heroQ=GOOD -> approve: is_approved=true
  - verdict=CONFIRMED/PROBABLE + heroQ=OK   -> approve: is_approved=true
  - verdict=CONFIRMED/PROBABLE + heroQ=BAD/NO_IMAGE -> try swap:
        * chain brand image if listing.parent_chain in chain-brand-images map
        * else Street View URL if latitude/longitude known
        * else hold: is_approved=false

Re-entrant: skips listings audited in the last N hours (default 24).

Usage:
  python3 scripts/auto-enforce-audit.py [--limit N] [--concurrency N]
                                        [--ids id1,id2,...] [--min-age-hours N]
                                        [--dry-run]
"""
import asyncio, aiohttp, json, sys, os, datetime, re, ssl

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'auto-enforce-audit.log')

CONCURRENCY = 4
LIMIT = 0
MIN_AGE_HOURS = 24
IDS_ARG = None
DRY_RUN = False

for i, a in enumerate(sys.argv[1:], 1):
    if a == '--limit' and i < len(sys.argv)-1: LIMIT = int(sys.argv[i+1])
    elif a.startswith('--limit='): LIMIT = int(a.split('=')[1])
    elif a == '--concurrency' and i < len(sys.argv)-1: CONCURRENCY = int(sys.argv[i+1])
    elif a.startswith('--concurrency='): CONCURRENCY = int(a.split('=')[1])
    elif a == '--min-age-hours' and i < len(sys.argv)-1: MIN_AGE_HOURS = int(sys.argv[i+1])
    elif a.startswith('--min-age-hours='): MIN_AGE_HOURS = int(a.split('=')[1])
    elif a.startswith('--ids='): IDS_ARG = a.split('=',1)[1].split(',')
    elif a == '--dry-run': DRY_RUN = True


def log(msg):
    line = f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f: f.write(line + '\n')


SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE


async def sb_get(session, path):
    headers = {'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}'}
    async with session.get(f'{SUPABASE_URL}{path}', headers=headers, ssl=SSL_CTX, timeout=aiohttp.ClientTimeout(total=30)) as r:
        return await r.json()


async def sb_patch(session, path, body):
    headers = {
        'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}',
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
    }
    async with session.patch(f'{SUPABASE_URL}{path}', headers=headers, json=body, ssl=SSL_CTX, timeout=aiohttp.ClientTimeout(total=30)) as r:
        return r.status


# Parse chain-brand-images.ts once
CHAIN_BRAND = {}
def load_chain_brands():
    global CHAIN_BRAND
    path = os.path.join(os.path.dirname(SCRIPT_DIR), 'lib', 'chain-brand-images.ts')
    if not os.path.exists(path): return
    src = open(path).read()
    STORAGE = 'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/chain-brands'
    # Match 'Chain': `${STORAGE}/file.jpg` or 'Chain': 'https://...' or 'Chain': ['https://...', ...]
    pattern = re.compile(r"'([^']+)':\s*(?:`\$\{STORAGE\}/([^`]+)`|'(https?:[^']+)'|\[([^\]]+)\])")
    for m in pattern.finditer(src):
        name, storage_file, literal_url, array_body = m.groups()
        if storage_file: CHAIN_BRAND[name] = f'{STORAGE}/{storage_file}'
        elif literal_url: CHAIN_BRAND[name] = literal_url
        elif array_body:
            first = re.search(r"'(https?:[^']+)'", array_body)
            if first: CHAIN_BRAND[name] = first.group(1)
    log(f'Loaded {len(CHAIN_BRAND)} chain-brand images')


def street_view_url(lat, lng):
    if lat is None or lng is None: return None
    # Free public Street View static. 640x400 landscape, 0 pitch. No API key needed
    # for this URL pattern (Google returns static JPEG or placeholder if not found).
    return f'https://maps.googleapis.com/maps/api/streetview?size=640x400&location={lat},{lng}&pitch=0&fov=80'


async def audit_one(session, listing_id, listing_data, stats):
    """Call audit edge function + apply decision to DB."""
    try:
        # Invoke audit
        headers = {
            'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}',
            'Content-Type': 'application/json',
        }
        async with session.post(
            f'{SUPABASE_URL}/functions/v1/ai-audit-listing',
            headers=headers,
            json={'listing_id': listing_id},
            ssl=SSL_CTX,
            timeout=aiohttp.ClientTimeout(total=120),
        ) as r:
            if r.status != 200:
                body = await r.text()
                stats['errors'] += 1
                log(f'  ❌ {listing_id[:8]} audit failed: HTTP {r.status} {body[:120]}')
                return
            res = await r.json()

        verdict_obj = res.get('verdict') or {}
        verdict = verdict_obj.get('verdict')
        confidence = verdict_obj.get('confidence')
        hero_q = verdict_obj.get('hero_image_quality')
        reasoning = (verdict_obj.get('reasoning') or '')[:300]

        stats['by_verdict'][verdict or 'null'] = stats['by_verdict'].get(verdict or 'null', 0) + 1

        # ===== Decision tree =====
        today = datetime.date.today().isoformat()
        patch = None
        action = 'noop'

        if verdict == 'NOT_TOUCHLESS':
            patch = {
                'is_touchless': False, 'is_approved': False, 'touchless_verified': None,
                'hero_image': None, 'hero_image_source': None,
                'crawl_notes': f'[{today}] Auto-reverted (Pro audit). conf={confidence}. {reasoning}'
            }
            action = 'revert'
        elif verdict == 'UNCERTAIN':
            patch = {
                'is_approved': False,
                'crawl_notes': f'[{today}] Auto-held (Pro audit UNCERTAIN). conf={confidence}. {reasoning}'
            }
            action = 'hold'
        elif verdict in ('TOUCHLESS_CONFIRMED', 'TOUCHLESS_PROBABLE'):
            if hero_q in ('GOOD', 'OK'):
                patch = {
                    'is_approved': True,
                    'crawl_notes': f'[{today}] Auto-approved (Pro audit {verdict}, hero {hero_q}).'
                }
                action = 'approve'
            else:
                # Hero is BAD or NO_IMAGE — try fallback
                parent_chain = (listing_data or {}).get('parent_chain')
                brand_url = CHAIN_BRAND.get(parent_chain) if parent_chain else None
                if brand_url:
                    patch = {
                        'is_approved': True,
                        'hero_image': brand_url,
                        'hero_image_source': 'chain-brand',
                        'crawl_notes': f'[{today}] Auto-approved + hero swapped to chain brand (Pro audit flagged prior hero as {hero_q}).'
                    }
                    action = 'approve+hero-swap-brand'
                else:
                    # Use existing street_view_url ONLY (don't generate new ones —
                    # per memory feedback_street_view_heroes_intentional.md, those were
                    # manually curated and fresh auto-gen SV often 403s without API key).
                    existing_sv = (listing_data or {}).get('street_view_url')
                    existing_google = (listing_data or {}).get('google_photo_url')
                    if existing_sv:
                        patch = {
                            'is_approved': True,
                            'hero_image': None, 'hero_image_source': None,
                            'crawl_notes': f'[{today}] Auto-approved + cleared hero so page falls back to existing Street View (Pro audit flagged prior hero as {hero_q}).'
                        }
                        action = 'approve+fallback-sv'
                    elif existing_google:
                        patch = {
                            'is_approved': True,
                            'hero_image': None, 'hero_image_source': None,
                            'crawl_notes': f'[{today}] Auto-approved + cleared hero so page falls back to existing google_photo_url (Pro audit flagged prior hero as {hero_q}).'
                        }
                        action = 'approve+fallback-google'
                    else:
                        patch = {
                            'is_approved': False,
                            'hero_image': None, 'hero_image_source': None,
                            'crawl_notes': f'[{today}] Auto-held (Pro audit {verdict} but hero {hero_q}, no chain brand, no SV or google_photo fallback).'
                        }
                        action = 'hold-no-fallback'
        else:
            # null / parse failure
            stats['errors'] += 1
            log(f'  ⚠ {listing_id[:8]} parse failure')
            return

        if DRY_RUN:
            log(f'  [DRY] {listing_id[:8]} {verdict}/{hero_q}/conf{confidence} -> {action}')
        else:
            status = await sb_patch(session, f'/rest/v1/listings?id=eq.{listing_id}', patch)
            if status >= 400:
                stats['errors'] += 1
                log(f'  ❌ {listing_id[:8]} update failed: HTTP {status}')
                return

        stats['actions'][action] = stats['actions'].get(action, 0) + 1
        stats['done'] += 1
        if stats['done'] % 10 == 0:
            log(f'  [{stats["done"]}/{stats["total"]}] {verdict}/{hero_q} -> {action}')
    except Exception as e:
        stats['errors'] += 1
        log(f'  ❌ {listing_id[:8]} exception: {str(e)[:150]}')


async def main():
    load_chain_brands()

    log('=' * 60)
    log(f'AUTO-ENFORCEMENT (Gemini 2.5 Pro) — dry_run={DRY_RUN} conc={CONCURRENCY} limit={LIMIT or "none"}')
    log('=' * 60)

    async with aiohttp.ClientSession() as session:
        # Build target ID list
        if IDS_ARG:
            ids = IDS_ARG
            log(f'Using {len(ids)} IDs from --ids flag')
        else:
            ids = []
            offset = 0
            while True:
                rows = await sb_get(session, f'/rest/v1/listings?select=id&is_touchless=eq.true&limit=1000&offset={offset}')
                if not rows: break
                ids.extend([r['id'] for r in rows])
                if len(rows) < 1000: break
                offset += 1000
            log(f'Touchless listings total: {len(ids)}')

            # Skip listings with recent audit (< MIN_AGE_HOURS)
            cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=MIN_AGE_HOURS)).isoformat()
            recent = set()
            offset = 0
            while True:
                rows = await sb_get(session, f'/rest/v1/ai_audits?select=listing_id&audited_at=gte.{cutoff}&limit=1000&offset={offset}')
                if not rows or not isinstance(rows, list): break
                for r in rows:
                    if isinstance(r, dict): recent.add(r.get('listing_id'))
                if len(rows) < 1000: break
                offset += 1000
            ids = [i for i in ids if i not in recent]
            log(f'After skipping {len(recent)} with audit < {MIN_AGE_HOURS}h old: {len(ids)} to enforce')

        if LIMIT > 0: ids = ids[:LIMIT]

        # Pre-fetch listing data (parent_chain, lat/lng, street_view) for swap logic
        listing_data = {}
        for chunk_start in range(0, len(ids), 200):
            chunk = ids[chunk_start:chunk_start+200]
            id_filter = ','.join(chunk)
            rows = await sb_get(session, f'/rest/v1/listings?select=id,parent_chain,latitude,longitude,street_view_url,google_photo_url&id=in.({id_filter})')
            for r in rows or []: listing_data[r['id']] = r

        stats = {'total': len(ids), 'done': 0, 'errors': 0, 'by_verdict': {}, 'actions': {}}
        sem = asyncio.Semaphore(CONCURRENCY)

        async def run_one(lid):
            async with sem:
                await audit_one(session, lid, listing_data.get(lid), stats)

        await asyncio.gather(*(run_one(i) for i in ids), return_exceptions=True)

        log('=' * 60)
        log(f'COMPLETE: {stats["done"]}/{stats["total"]} enforced, {stats["errors"]} errors')
        log('Verdict distribution:')
        for v, n in sorted(stats['by_verdict'].items(), key=lambda x: -x[1]):
            log(f'  {v:<25} {n}')
        log('Action taken:')
        for a, n in sorted(stats['actions'].items(), key=lambda x: -x[1]):
            log(f'  {a:<25} {n}')
        log('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
