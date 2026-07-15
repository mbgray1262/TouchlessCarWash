#!/usr/bin/env python3
"""
⛔️ RETIRED — DO NOT USE. Kept for reference only.
Use `node scripts/selfserve-places-fetch.mjs XX` instead (authoritative Google Places API).

Why retired: this scrapes the WHOLE Maps page, so it repeatedly captured photos that
belong to OTHER businesses and attached them to the wrong listing:
  1. When Google served a search/nearby view instead of the place page (VPN drop → EU
     consent bounce), it cached whole other washes' photos → contaminated OH + MI.
  2. Even on the correct place page, Google renders a "nearby places" carousel; in dense
     areas one prominent wash's photo leaked into 3-6 neighbours' caches → contaminated
     AZ + NC (the same blue building became the hero on 4 different Glendale listings).
The place-verification guard below fixes (1) but NOT (2), and scoping a whole-page scrape
to only the subject's own photos is not reliably achievable. The Places API is scoped to
the place_id server-side and cannot return a neighbour's photo — so that is now the source.
See memory: project_scraper_photo_contamination.

FREE Google Maps photo fetcher (historical): drove headless Chromium (Playwright) to load
each listing's Maps place page and scrape its photo URLs into scripts/_maps_photos_cache.json.
Required a US IP (VPN) so Google skipped the EU consent wall.
  python3 scripts/maps-photos-scrape.py OH
"""
import sys, os, re, time, json, ssl, urllib.request, random
from playwright.sync_api import sync_playwright

STATE = (sys.argv[1] if len(sys.argv) > 1 else 'OH').upper()
FORCE = '--force' in sys.argv
CACHE = 'scripts/_maps_photos_cache.json'

env = {}
for line in open('.env.local'):
    if '=' in line and not line.strip().startswith('#'):
        k, v = line.split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
SB_URL = env.get('NEXT_PUBLIC_SUPABASE_URL') or env.get('SUPABASE_URL')
SB_KEY = env['SUPABASE_SERVICE_ROLE_KEY']
CTX = ssl._create_unverified_context()  # only used to read our OWN supabase

def sb(path):
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{path}",
        headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'})
    return json.load(urllib.request.urlopen(req, context=CTX))

# Pending listings for this state (unreviewed self-serve, not closed, has place_id)
rows = sb(f"listings?select=name,google_place_id"
          f"&is_self_service=eq.true&self_service_reviewed_at=is.null"
          f"&state=eq.{STATE}&google_place_id=not.is.null&limit=2000")
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
todo = [r for r in rows if FORCE or r['google_place_id'] not in cache]
print(f"{STATE}: {len(rows)} pending listings, {len(todo)} to scrape "
      f"({len(rows)-len(todo)} already cached).")
if not todo:
    sys.exit(0)

# place photos are lh3 URLs tagged gps-cs (owner/Google) or geougc (user) — NOT
# avatars (a/ , a-/) or UI icons. Dedupe by the base URL (before the =size suffix).
PHOTO_RE = re.compile(r'https://lh3\.googleusercontent\.com/(?:gps-cs|geougc)[^"\'\\ )]+')

import unicodedata
# Tokens too generic to identify a specific wash — a name made ONLY of these can't be
# verified against Google's h1, so those listings are accepted only as a bare place page.
GENERIC = {'car', 'wash', 'self', 'serve', 'service', 'auto', 'center', 'centre', 'llc',
           'inc', 'co', 'the', 'and', 'coin', 'op', 'clean', 'spot', 'bay', 'detailing',
           'detail', 'automatic', 'touchless', 'touch', 'free', 'express'}
def _norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9 ]', ' ', s.lower())
def _distinctive(name):
    return set(t for t in _norm(name).split() if t and t not in GENERIC)

# THE CONTAMINATION GUARD (2026-07-14): the old scraper regexed the WHOLE page and
# trusted whatever loaded. When Google intermittently served a SEARCH/nearby-places view
# (a VPN blip / consent bounce is enough), it cached OTHER businesses' photos under this
# place_id — e.g. Shiny Brite (1 real photo) got 8 foreign Drive&Shine / "$5 Wacky" shots,
# and the AI picked the glossy foreign building as the hero. A CLEAN single-place page
# never leaks (verified: Shiny Brite's real page = exactly its own photos), so the fix is
# to confirm we're on the right place before trusting any photo, and retry if we're not.
def _verify_place(pg, name):
    """Return True only if the page is a single place page for THIS listing."""
    if '/maps/search/' in (pg.url or ''):
        return False                          # a results list, not one place
    try:
        h1 = pg.locator('h1').first.inner_text(timeout=4000)
    except Exception:
        return False                          # no place header → not a clean place page
    if not h1 or not h1.strip() or 'result' in h1.lower():
        return False
    want, got = _distinctive(name), _distinctive(h1)
    # If the listing name has distinctive words, the place header must share at least one
    # (guards against landing on a differently-named nearby wash). If the name is fully
    # generic ("Self Serve Car Wash"), we can't name-verify — accept the bare place page.
    if want and got and not (want & got):
        return False
    return True

def scrape(pg, pid, name):
    for attempt in range(3):                  # retry: bad loads are intermittent
        try:
            pg.goto(f"https://www.google.com/maps/place/?q=place_id:{pid}",
                    wait_until='domcontentloaded', timeout=45000)
        except Exception:
            time.sleep(1.5); continue
        time.sleep(2.2)
        for sel in ['button[aria-label*="Accept all"]', 'button:has-text("Accept all")',
                    'button:has-text("Aceitar tudo")']:
            try:
                if pg.locator(sel).count() > 0:
                    pg.locator(sel).first.click(timeout=3000); time.sleep(1.8); break
            except Exception: pass
        if _verify_place(pg, name):
            found = set()
            for _ in range(14):               # scroll to lazy-load the place's photo strip
                for u in PHOTO_RE.findall(pg.content()):
                    found.add(u.split('=')[0])
                try: pg.mouse.wheel(0, 3500)
                except Exception: pass
                time.sleep(0.55)
            return sorted(found)              # trusted: photos belong to THIS place
        time.sleep(1.0 + attempt)             # untrusted page → reload and try again
    return None                               # never got a verified place page → skip (no foreign photos)

done = 0; untrusted = 0
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(locale='en-US',
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    page = ctx.new_page()
    for i, r in enumerate(todo):
        pid = r['google_place_id']
        try:
            urls = scrape(page, pid, r['name'])
            if urls is None:                   # never verified the right place → cache NOTHING
                cache[pid] = []                # (better a street-view/manual hero than a foreign one)
                untrusted += 1
                print(f"  [{i+1}/{len(todo)}] {r['name'][:34]}: ⚠ UNVERIFIED page — skipped (no photos cached)")
            else:
                cache[pid] = urls
                done += 1
                if done % 10 == 0 or done <= 5:
                    print(f"  [{i+1}/{len(todo)}] {r['name'][:34]}: {len(urls)} photos")
        except Exception as e:
            cache[pid] = cache.get(pid, [])
            print(f"  [{i+1}/{len(todo)}] {r['name'][:34]}: ERROR {str(e)[:70]}")
        if (done + untrusted) % 15 == 0:   # persist incrementally
            json.dump(cache, open(CACHE, 'w'))
        time.sleep(1.0 + random.random() * 1.2)   # pace so Google doesn't throttle
    browser.close()

json.dump(cache, open(CACHE, 'w'))
counts = [len(cache[r['google_place_id']]) for r in todo]
nonzero = [c for c in counts if c]
print(f"\nDONE {STATE}: scraped {done}/{len(todo)} | "
      f"{len(nonzero)} got photos (avg {sum(nonzero)//max(len(nonzero),1)}, max {max(counts) if counts else 0}) | "
      f"{len(counts)-len(nonzero)} got 0 | {untrusted} unverified-skipped. Cache: {CACHE}")
