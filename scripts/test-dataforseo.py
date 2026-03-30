#!/usr/bin/env python3
"""
Quick test of DataForSEO Google Reviews API.
Fetches reviews for a known touchless listing and prints the raw response.

Usage:
  python3 scripts/test-dataforseo.py
"""
import json, ssl, urllib.request, urllib.parse

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

SUPABASE_BASE = "https://gteqijdpqjmgxfnyuhvy.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78"

# DataForSEO HTTP Basic Auth (already base64-encoded: email:password)
DATAFORSEO_KEY = "bWljaGFlbEB0b3VjaGxlc3NjYXJ3YXNoZmluZGVyLmNvbTo0ZTQyOWQxMjdhOTExZDdh"

# ─── Step 1: Grab a few touchless listings with google_place_id from DB ────────

print("Fetching sample touchless listings from DB...", flush=True)
req = urllib.request.Request(
    f"{SUPABASE_BASE}/rest/v1/listings"
    f"?select=id,name,city,state,google_place_id,review_mine_status"
    f"&is_touchless=eq.true"
    f"&google_place_id=not.is.null"
    f"&review_mine_status=is.null"
    f"&order=review_count.desc.nullslast"
    f"&limit=3",
    headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"}
)
with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as r:
    listings = json.loads(r.read())

if not listings:
    print("No listings found — try adjusting the filter.")
    exit(1)

for l in listings:
    print(f"  {l['name']} — {l['city']}, {l['state']} | place_id: {l['google_place_id']}")

# ─── Step 2: Call DataForSEO for the first listing ─────────────────────────────

listing = listings[0]
place_id = listing["google_place_id"]
print(f"\nCalling DataForSEO for: {listing['name']} (place_id={place_id})")
print("Endpoint: business_data/google/reviews/live/advanced\n")

payload = json.dumps([{
    "place_id": place_id,
    "depth": 50,          # fetch up to 50 reviews
    "language_code": "en",
    "sort_by": "most_relevant",
}]).encode()

req = urllib.request.Request(
    "https://api.dataforseo.com/v3/business_data/google/reviews/live/regular",
    data=payload,
    method="POST",
    headers={
        "Authorization": f"Basic {DATAFORSEO_KEY}",
        "Content-Type": "application/json",
    }
)

with urllib.request.urlopen(req, timeout=60, context=ssl_ctx) as r:
    data = json.loads(r.read())

# ─── Step 3: Print results ─────────────────────────────────────────────────────

status = data.get("status_code")
cost = data.get("cost")
print(f"Response status_code: {status}")
print(f"Cost for this call:   ${cost}")

tasks = data.get("tasks", [])
if not tasks:
    print("No tasks in response.")
    exit(1)

task = tasks[0]
task_status = task.get("status_code")
task_msg = task.get("status_message")
print(f"Task status:          {task_status} — {task_msg}")

result_list = task.get("result") or []
if not result_list:
    print("No results in task.")
    exit(1)

result = result_list[0]
total_reviews = result.get("reviews_count")
items = result.get("items") or []

print(f"\nTotal reviews on listing: {total_reviews}")
print(f"Reviews returned:         {len(items)}")

# Show field names from first review
if items:
    print(f"\nField names in first review:")
    for k, v in items[0].items():
        print(f"  {k}: {repr(v)[:80]}")

# ─── Step 4: Filter for touchless keywords ────────────────────────────────────

KEYWORDS = [
    'touchless', 'touch-free', 'touchfree', 'touch free',
    'brushless', 'brush-free', 'brushfree', 'brush free',
    'no brush', 'no-brush', 'laser wash', 'laserwash',
    'no-touch', 'no touch', 'frictionless',
]

print("\n--- Reviews mentioning touchless keywords ---")
found = 0
for item in items:
    text = item.get("review_text") or ""
    lower = text.lower()
    matches = [kw for kw in KEYWORDS if kw in lower]
    if matches:
        found += 1
        rating = item.get("rating", {})
        stars = rating.get("value") if isinstance(rating, dict) else rating
        reviewer = item.get("profile_name", "?")
        date = item.get("timestamp", "")[:10]
        print(f"\n  [{stars}★] {reviewer} ({date})")
        print(f"  Keywords: {matches}")
        print(f"  Text: {text[:300]}")

if found == 0:
    print("  (none found in top 50 reviews)")

print(f"\n=== SUMMARY ===")
print(f"  Listing:          {listing['name']} — {listing['city']}, {listing['state']}")
print(f"  Total reviews:    {total_reviews}")
print(f"  Fetched:          {len(items)}")
print(f"  Touchless hits:   {found}")
print(f"  API cost:         ${cost}")
