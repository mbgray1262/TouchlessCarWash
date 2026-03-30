#!/usr/bin/env python3
"""
Run review mining (scan_single) on all unknown (is_touchless=null) listings
that have never been review-mined (review_mine_status IS NULL).

This bypasses scan_batch's category/name filter and processes any listing
with a google_place_id, including generic gas station entries.

Usage:
  python3 scripts/review-mine-unknowns.py [--limit N] [--dry-run]

Options:
  --limit N   Process at most N listings (default: all)
  --dry-run   Print what would be processed without calling the API
"""
import os, sys, json, ssl, urllib.request, urllib.parse, time

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78"
BASE = "https://gteqijdpqjmgxfnyuhvy.supabase.co"
DRY_RUN = "--dry-run" in sys.argv
LIMIT = None
for i, arg in enumerate(sys.argv):
    if arg == "--limit" and i + 1 < len(sys.argv):
        LIMIT = int(sys.argv[i + 1])

# Rate limiting: scan_single uses ~2 SerpAPI calls per listing
# Free tier: 100/month. Paid: varies. Adjust delay as needed.
DELAY_BETWEEN_CALLS = 1.2  # seconds

def api_get(path):
    req = urllib.request.Request(f"{BASE}{path}", headers={
        "apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"
    })
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())

def scan_single(listing_id):
    """Call review-mine scan_single for one listing. Returns result dict."""
    body = json.dumps({"action": "scan_single", "listing_id": listing_id}).encode()
    req = urllib.request.Request(
        f"{BASE}/functions/v1/review-mine",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ANON_KEY}",
        }
    )
    with urllib.request.urlopen(req, timeout=45, context=ssl_ctx) as r:
        return json.loads(r.read())

# ─── Load all never-scanned unknowns ──────────────────────────────────────────

print("Loading never-scanned unknown listings...", flush=True)
all_listings = []
offset = 0
while True:
    batch = api_get(
        f"/rest/v1/listings?select=id,name,city,state,review_count"
        f"&is_touchless=is.null&review_mine_status=is.null"
        f"&google_place_id=not.is.null"
        f"&order=review_count.desc.nullslast"
        f"&limit=1000&offset={offset}"
    )
    if not batch:
        break
    all_listings.extend(batch)
    if len(batch) < 1000:
        break
    offset += 1000

total = len(all_listings)
if LIMIT:
    all_listings = all_listings[:LIMIT]

print(f"  Found {total} never-scanned unknowns (processing {len(all_listings)})", flush=True)
print(f"  Estimated SerpAPI calls: ~{len(all_listings) * 2}", flush=True)

if DRY_RUN:
    print("\n--- DRY RUN: first 20 listings that would be processed ---")
    for r in all_listings[:20]:
        print(f"  {r['name']} — {r['city']}, {r['state']} (reviews: {r.get('review_count', 0)})")
    sys.exit(0)

# ─── Process each listing ──────────────────────────────────────────────────────

print(f"\nStarting review mining... (Ctrl+C to stop safely)\n", flush=True)

found_touchless = 0
found_not_touchless = 0
no_reviews = 0
errors = 0
start = time.time()

for i, listing in enumerate(all_listings):
    lid = listing["id"]
    name = listing["name"]
    city = listing.get("city", "?")
    state = listing.get("state", "?")

    try:
        result = scan_single(lid)
        status = result.get("status", "unknown")

        if status == "touchless_found":
            found_touchless += 1
            print(f"  ✓ TOUCHLESS  {name} — {city}, {state}", flush=True)
        elif status == "not_touchless":
            found_not_touchless += 1
            print(f"  ✗ NOT TOUCH  {name} — {city}, {state}", flush=True)
        elif status in ("no_reviews", "error"):
            no_reviews += 1
        # else: scanned_clean, ai_rejected — counted implicitly

        errors = 0  # reset consecutive error counter

    except KeyboardInterrupt:
        print(f"\nStopped by user at {i+1}/{len(all_listings)}", flush=True)
        break
    except Exception as e:
        errors += 1
        print(f"  ! ERROR      {name}: {e}", flush=True)
        if errors >= 5:
            print("Too many consecutive errors, stopping.", flush=True)
            break
        time.sleep(3)
        continue

    # Progress every 50 listings
    if (i + 1) % 50 == 0:
        elapsed = time.time() - start
        rate = (i + 1) / elapsed
        remaining = len(all_listings) - i - 1
        eta_min = remaining / (rate * 60) if rate else 0
        print(
            f"  [{i+1}/{len(all_listings)}] "
            f"touchless={found_touchless} not={found_not_touchless} no_reviews={no_reviews} "
            f"| {rate:.1f}/s ETA {eta_min:.0f}m",
            flush=True
        )

    time.sleep(DELAY_BETWEEN_CALLS)

elapsed = time.time() - start
print(f"\n=== DONE in {elapsed/60:.1f}m ===")
print(f"  Touchless found:     {found_touchless}")
print(f"  Not touchless found: {found_not_touchless}")
print(f"  No reviews:          {no_reviews}")
print(f"  Errors:              {errors}")
