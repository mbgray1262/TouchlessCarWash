#!/usr/bin/env python3
"""Reclassify all touchless listings one at a time."""
import urllib.request
import json
import time
import sys
import ssl

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

APIKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78"
BASE = "https://gteqijdpqjmgxfnyuhvy.supabase.co"

def api_get(path):
    req = urllib.request.Request(f"{BASE}{path}", headers={
        "apikey": APIKEY, "Authorization": f"Bearer {APIKEY}"
    })
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())

def api_post(path, data):
    req = urllib.request.Request(f"{BASE}{path}",
        data=json.dumps(data).encode(), method="POST", headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {APIKEY}"
    })
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())

# Fetch all touchless listing IDs with hero images, in pages
print("Fetching listing IDs...", flush=True)
all_ids = []
page = 0
while True:
    batch = api_get(f"/rest/v1/listings?is_touchless=eq.true&hero_image=neq.&select=id&order=name&offset={page*1000}&limit=1000")
    all_ids.extend([r["id"] for r in batch])
    print(f"  Got {len(batch)} IDs (total: {len(all_ids)})", flush=True)
    if len(batch) < 1000:
        break
    page += 1

TOTAL = len(all_ids)
print(f"\n=== RECLASSIFY {TOTAL} listings | {time.strftime('%H:%M:%S')} ===", flush=True)

done = 0
high = 0
cleared = 0
failed = 0
errors = 0
start = time.time()

for i, lid in enumerate(all_ids):
    try:
        d = api_post("/functions/v1/detect-equipment", {"listing_id": lid})
        det = d.get("detection")
        if det and det.get("confidence") == "high":
            high += 1
        elif not det or det.get("confidence") != "high":
            cleared += 1
        done += 1
        errors = 0
    except Exception as e:
        errors += 1
        failed += 1
        done += 1
        if errors > 10:
            print(f"\nToo many consecutive errors. Last: {e}", flush=True)
            break
        time.sleep(2)
        continue

    # Progress every 100 listings
    if (i + 1) % 100 == 0:
        elapsed = time.time() - start
        pct = (i + 1) * 100 / TOTAL
        rate = done / elapsed if elapsed else 0
        eta = (TOTAL - i - 1) / (rate * 60) if rate else 0
        print(f"{i+1:5d}/{TOTAL} ({pct:5.1f}%) | high={high} cleared={cleared} fail={failed} | {rate:.1f}/s ETA {eta:.0f}m", flush=True)

    # Spot check every 500
    if (i + 1) % 500 == 0:
        d2 = d  # last result
        det = d2.get("detection")
        name = d2.get("name", "?")
        if det:
            print(f"  SPOT: {name} -> {det['brand']}/{det.get('model','?')} ({det['confidence']})", flush=True)
        else:
            diag = d2.get("diagnostics", [{}])[0]
            raw = diag.get("raw_ai_response", "")[:80]
            print(f"  SPOT: {name} -> NONE ({raw})", flush=True)

    time.sleep(0.3)

elapsed = time.time() - start
print(f"\n=== DONE in {elapsed/60:.1f}m ===", flush=True)
print(f"Processed: {done} | HIGH saved: {high} | Cleared: {cleared} | Failed: {failed}", flush=True)
