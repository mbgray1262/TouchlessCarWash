#!/usr/bin/env python3
"""
Held-listing resolver: takes every held listing and tries to promote it to
approved by cascading through recovery paths.

Rules:
  1. Already has hero + AI says CONFIRMED + heroQ=GOOD/OK  -> approve
  2. Pro audit says NOT_TOUCHLESS                           -> revert
  3. Audit UNCERTAIN                                        -> stay held
  4. No hero but has google_photo_url or street_view_url    -> approve (page falls back)
  5. No hero but has photos[] array                          -> promote best photo to hero
  6. No hero, no photos, has google_place_id                -> fetch Places API photo
  7. Else                                                    -> stay held

For 5 & 6, we set hero_image and let the next audit cron verify it. Immediate
approval happens in cases 1 & 4 where we already have a verified-good image.

Runs as cron alongside auto-enforce-audit.py.

Usage: python3 scripts/resolve-held-listings.py [--limit N] [--dry-run] [--skip-places]
"""
import asyncio, aiohttp, json, sys, os, datetime, ssl

SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

SCRIPT_DIR = os.path.dirname(__file__)
LOG_FILE = os.path.join(SCRIPT_DIR, 'resolve-held.log')

LIMIT = 0
DRY_RUN = False
SKIP_PLACES = False

for i, a in enumerate(sys.argv[1:], 1):
    if a == '--limit' and i < len(sys.argv)-1: LIMIT = int(sys.argv[i+1])
    elif a.startswith('--limit='): LIMIT = int(a.split('=')[1])
    elif a == '--dry-run': DRY_RUN = True
    elif a == '--skip-places': SKIP_PLACES = True


def log(msg):
    line = f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f: f.write(line + '\n')


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


def get_serpapi_key():
    env_file = os.path.join(os.path.dirname(SCRIPT_DIR), '.env.local')
    if not os.path.exists(env_file): return None
    for line in open(env_file):
        if line.startswith('SERPAPI_KEY='):
            return line.split('=',1)[1].strip().strip('"').strip("'")
    return None


async def fetch_serpapi_places_photos(session, place_id, api_key):
    """Return a list of Google Places photo URLs via SerpAPI (user-submitted, not street-view).

    These are the photos Google displays on the business's Maps listing — typically
    uploaded by the owner or customers showing the actual facility. Way more
    reliable than auto-generated Street View.
    """
    if not api_key or not place_id: return []
    # SerpAPI google_maps engine — place lookup by place_id returns place_info with photos
    url = 'https://serpapi.com/search.json'
    params = {
        'engine': 'google_maps',
        'type': 'place',
        'place_id': place_id,
        'api_key': api_key,
    }
    try:
        async with session.get(url, params=params, ssl=SSL_CTX, timeout=aiohttp.ClientTimeout(total=30)) as r:
            if r.status != 200: return []
            j = await r.json()
            # SerpAPI returns place_results with a photos field or a separate photos_results
            photos = []
            place_results = j.get('place_results') or {}
            # Option 1: direct photos array in place_results
            for p in place_results.get('photos', []) or []:
                if isinstance(p, dict) and p.get('thumbnail'):
                    photos.append(p['thumbnail'])
                elif isinstance(p, str):
                    photos.append(p)
            # Option 2: thumbnail field on place_results
            if not photos and place_results.get('thumbnail'):
                photos.append(place_results['thumbnail'])
            return photos
    except Exception as e:
        log(f'    SerpAPI fetch error for {place_id[:15]}: {e}')
        return []


async def resolve_one(session, listing, audit, api_key, stats):
    lid = listing['id']
    name = listing.get('name', '')[:40]
    today = datetime.date.today().isoformat()

    verdict = audit.get('verdict') if audit else None
    hero_q = audit.get('hero_image_quality') if audit else None

    patch = None
    action = 'skip'

    # === Path 2: NOT_TOUCHLESS stragglers ===
    if verdict == 'NOT_TOUCHLESS':
        patch = {
            'is_touchless': False,
            'touchless_verified': None,
            'hero_image': None, 'hero_image_source': None,
            'crawl_notes': f'[{today}] Reverted via resolve-held (Pro audit NOT_TOUCHLESS).'
        }
        action = 'revert-not-touchless'

    # === Path 3: UNCERTAIN stays held ===
    elif verdict == 'UNCERTAIN':
        action = 'stay-held-uncertain'

    # === Path 1: CONFIRMED/PROBABLE + good hero already -> approve ===
    elif verdict in ('TOUCHLESS_CONFIRMED', 'TOUCHLESS_PROBABLE') and hero_q in ('GOOD', 'OK'):
        patch = {
            'is_approved': True,
            'crawl_notes': f'[{today}] Auto-approved via resolve-held: audit {verdict} + hero {hero_q}.'
        }
        action = 'approve-existing-good-hero'

    # === Paths 4-6: CONFIRMED/PROBABLE but need hero fix ===
    elif verdict in ('TOUCHLESS_CONFIRMED', 'TOUCHLESS_PROBABLE'):
        hero = listing.get('hero_image')
        google_photo = listing.get('google_photo_url')
        street_view = listing.get('street_view_url')
        photos = listing.get('photos') or []
        place_id = listing.get('google_place_id')

        # Path 4: have google_photo (user-submitted to Google, reliable)
        # NOTE: street_view_url removed as a fallback — auto-generated Street View
        # is too unreliable (random angles, wrong building, trees blocking facility).
        if google_photo:
            patch = {
                'is_approved': True,
                'hero_image': None, 'hero_image_source': None,
                'crawl_notes': f'[{today}] Auto-approved via resolve-held: {verdict}, page falls back to existing google_photo_url.'
            }
            action = 'approve-fallback-google-photo'

        # Path 5: promote photos[0] to hero
        elif photos and isinstance(photos, list) and len(photos) > 0:
            patch = {
                'hero_image': photos[0],
                'hero_image_source': 'promoted-from-photos',
                'crawl_notes': f'[{today}] Hero promoted from photos[0] via resolve-held; next audit cron will verify the new hero.'
            }
            # Don't approve yet — wait for audit to verify the new hero
            action = 'promote-photo-needs-reaudit'

        # Path 6: fetch Google Places photo via SerpAPI (user-submitted facility photos, reliable)
        elif place_id and api_key and not SKIP_PLACES:
            photos_found = await fetch_serpapi_places_photos(session, place_id, api_key)
            if photos_found:
                patch = {
                    'hero_image': photos_found[0],
                    'photos': photos_found,  # store all for future fallbacks
                    'hero_image_source': 'serpapi-places',
                    'crawl_notes': f'[{today}] Hero fetched via SerpAPI Google Places ({len(photos_found)} photos stored); next audit cron will verify the new hero.'
                }
                action = 'serpapi-fetch-needs-reaudit'
            else:
                action = 'serpapi-no-photo'
        else:
            action = 'stay-held-no-recovery-path'
    else:
        # No audit yet
        action = 'stay-held-no-audit'

    stats['actions'][action] = stats['actions'].get(action, 0) + 1

    if patch:
        if DRY_RUN:
            log(f'  [DRY] {lid[:8]} {name:<40} {action}')
        else:
            status = await sb_patch(session, f'/rest/v1/listings?id=eq.{lid}', patch)
            if status >= 400:
                stats['errors'] += 1
                log(f'  ❌ {lid[:8]} {name} update failed: HTTP {status}')
                return
            log(f'  ✓ {lid[:8]} {name:<40} {action}')
        stats['done'] += 1


async def main():
    log('=' * 60)
    log(f'HELD RESOLVER — dry_run={DRY_RUN} skip_places={SKIP_PLACES}')
    log('=' * 60)

    api_key = None if SKIP_PLACES else get_serpapi_key()
    if not SKIP_PLACES and not api_key:
        log('⚠ No SERPAPI_KEY in .env.local — place_id path disabled')
    elif api_key:
        log(f'✓ SerpAPI key loaded — can fetch Google Places photos for place_id listings')

    async with aiohttp.ClientSession() as session:
        # Pull all held listings
        held = []
        offset = 0
        while True:
            rows = await sb_get(session, f'/rest/v1/listings?select=id,name,city,state,hero_image,google_photo_url,street_view_url,photos,google_place_id,parent_chain&is_touchless=eq.true&is_approved=eq.false&limit=1000&offset={offset}')
            if not rows or not isinstance(rows, list): break
            held.extend(rows)
            if len(rows) < 1000: break
            offset += 1000
        log(f'Held listings: {len(held)}')

        # Pull audits
        ids = [l['id'] for l in held]
        audits = {}
        for i in range(0, len(ids), 100):
            chunk = ','.join(ids[i:i+100])
            rows = await sb_get(session, f'/rest/v1/ai_audits?select=listing_id,verdict,hero_image_quality&listing_id=in.({chunk})')
            for r in rows or []:
                if isinstance(r, dict): audits[r['listing_id']] = r

        log(f'Audits found: {len(audits)}  (listings without audit: {len(ids) - len(audits)})')

        if LIMIT > 0: held = held[:LIMIT]

        stats = {'done': 0, 'errors': 0, 'actions': {}}

        # Sequential for now — Places API fetches are cheap and sequential is safer
        for l in held:
            await resolve_one(session, l, audits.get(l['id']), api_key, stats)

        log('=' * 60)
        log(f'COMPLETE: {stats["done"]} actions applied, {stats["errors"]} errors')
        log('Action breakdown:')
        for a, n in sorted(stats['actions'].items(), key=lambda x: -x[1]):
            log(f'  {n:>4}  {a}')
        log('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
