#!/usr/bin/env python3
"""
Find existing unknown listings that match equipment brands known to be touchless
(LaserWash/PDQ, Washworld Razor/Radiant, Leisuwash) by:
  1. Searching SerpAPI Google Maps for the brand names nationwide
  2. Extracting google_place_id from results
  3. Matching against unknown listings in the DB
  4. Flipping matches to is_touchless=true

Usage:
  SUPABASE_SERVICE_KEY=<key> python3 scripts/classify-laserwash.py [--apply]
"""
import os, sys, json, ssl, urllib.request, urllib.parse, time

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78"
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
SERPAPI_KEY = "55755336a910a993d54796e63ad15d1c9b8e74ee161a591f12ea5946bf136376"
BASE = "https://gteqijdpqjmgxfnyuhvy.supabase.co"
DRY_RUN = "--apply" not in sys.argv

# SerpAPI Google Maps searches — each returns local_results with place_id
# We search across a grid of major US cities to get nationwide coverage
BRAND_QUERIES = [
    ("LaserWash",         "PDQ LaserWash touchless IBA"),
    ("LaserWash 360",     "PDQ LaserWash 360 touchless IBA"),
    ("Washworld Razor",   "Washworld Razor touchless IBA"),
    ("Washworld Radiant", "Washworld Radiant touchless IBA"),
    ("Leisuwash",         "Leisuwash touchless IBA"),
]

# Representative US cities to give SerpAPI geographic coverage
CITIES = [
    "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX",
    "Phoenix, AZ", "Philadelphia, PA", "San Antonio, TX", "San Diego, CA",
    "Dallas, TX", "San Jose, CA", "Austin, TX", "Jacksonville, FL",
    "Fort Worth, TX", "Columbus, OH", "Charlotte, NC", "Indianapolis, IN",
    "San Francisco, CA", "Seattle, WA", "Denver, CO", "Nashville, TN",
    "Oklahoma City, OK", "El Paso, TX", "Washington, DC", "Las Vegas, NV",
    "Louisville, KY", "Memphis, TN", "Portland, OR", "Baltimore, MD",
    "Milwaukee, WI", "Albuquerque, NM", "Tucson, AZ", "Fresno, CA",
    "Sacramento, CA", "Atlanta, GA", "Kansas City, MO", "Minneapolis, MN",
    "Cleveland, OH", "Raleigh, NC", "Miami, FL", "Virginia Beach, VA",
    "Omaha, NE", "Oakland, CA", "Minneapolis, MN", "Tulsa, OK",
    "Tampa, FL", "New Orleans, LA", "Cincinnati, OH", "Detroit, MI",
    "Salt Lake City, UT", "Pittsburgh, PA",
]

def serpapi_maps_search(query, city):
    """Search SerpAPI Google Maps and return list of place_ids."""
    params = urllib.parse.urlencode({
        "engine": "google_maps",
        "q": f"{query} {city}",
        "type": "search",
        "api_key": SERPAPI_KEY,
    })
    url = f"https://serpapi.com/search.json?{params}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as r:
            data = json.loads(r.read())
        results = data.get("local_results", [])
        return [r["place_id"] for r in results if r.get("place_id")]
    except Exception as e:
        print(f"    SerpAPI error ({city}): {e}")
        return []

def api_get(path, key=ANON_KEY):
    req = urllib.request.Request(f"{BASE}{path}", headers={
        "apikey": key, "Authorization": f"Bearer {key}"
    })
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())

def api_patch_by_ids(ids, note, service_key):
    """PATCH a list of listing IDs to is_touchless=true."""
    for lid in ids:
        path = f"/rest/v1/listings?id=eq.{lid}"
        body = json.dumps({
            "is_touchless": True,
            "crawl_notes": f"Equipment brand match: {note}",
            "crawl_status": "classified",
        }).encode()
        req = urllib.request.Request(f"{BASE}{path}", data=body, method="PATCH", headers={
            "Content-Type": "application/json",
            "apikey": service_key, "Authorization": f"Bearer {service_key}",
            "Prefer": "return=minimal",
        })
        with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
            pass
        time.sleep(0.1)

# ---------------------------------------------------------------------------

if DRY_RUN:
    print("=== DRY RUN — pass --apply to write to DB ===\n")
else:
    if not SERVICE_KEY:
        print("ERROR: SUPABASE_SERVICE_KEY env var required for --apply mode")
        sys.exit(1)
    print("=== APPLY MODE — writing to DB ===\n")

# Step 1: Load all unknown listings with google_place_id into a lookup dict
print("Loading unknown listings from DB...", flush=True)
all_unknowns = {}  # google_place_id -> {id, name, city, state}
offset = 0
while True:
    batch = api_get(f"/rest/v1/listings?select=id,name,city,state,google_place_id&is_touchless=is.null&google_place_id=not.is.null&limit=1000&offset={offset}")
    if not batch:
        break
    for r in batch:
        if r.get("google_place_id"):
            all_unknowns[r["google_place_id"]] = r
    if len(batch) < 1000:
        break
    offset += 1000

print(f"  {len(all_unknowns)} unknown listings with google_place_id\n", flush=True)

# Step 2: Search for each brand across all cities
all_matches = {}  # place_id -> (listing, brand_note)

for brand_query, brand_note in BRAND_QUERIES:
    brand_matches = set()
    print(f"Searching: '{brand_query}'...", flush=True)

    for city in CITIES:
        place_ids = serpapi_maps_search(brand_query, city)
        new = [pid for pid in place_ids if pid in all_unknowns and pid not in brand_matches]
        brand_matches.update(new)
        if new:
            print(f"  {city}: found {len(new)} new matches", flush=True)
        time.sleep(0.5)  # SerpAPI rate limit

    print(f"  Total for '{brand_query}': {len(brand_matches)} unknown listings matched\n", flush=True)

    for pid in brand_matches:
        all_matches[pid] = (all_unknowns[pid], brand_note)

# Step 3: Report
print(f"=== TOTAL MATCHES: {len(all_matches)} unknown listings identified as touchless ===\n")
for pid, (listing, note) in sorted(all_matches.items(), key=lambda x: x[1][0]['state']):
    print(f"  {listing['name']} — {listing['city']}, {listing['state']} [{note}]")

if DRY_RUN:
    print(f"\nRe-run with --apply to flip {len(all_matches)} listings to is_touchless=true.")
else:
    print(f"\nFlipping {len(all_matches)} listings to is_touchless=true...", flush=True)
    matched_ids = [all_unknowns[pid]["id"] for pid in all_matches]
    api_patch_by_ids(matched_ids, "Equipment brand found via SerpAPI Google Maps search", SERVICE_KEY)
    print("Done.")
