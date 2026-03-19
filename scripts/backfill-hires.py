#!/usr/bin/env python3
"""Backfill low-res Google hero photos with high-res versions."""
import urllib.request, json, subprocess, ssl, sys

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

APIKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78"
BASE = "https://gteqijdpqjmgxfnyuhvy.supabase.co"

def api_get(path):
    req = urllib.request.Request(f"{BASE}{path}", headers={
        "apikey": APIKEY, "Authorization": f"Bearer {APIKEY}"
    })
    with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as r:
        return json.loads(r.read())

def api_post(path, data):
    req = urllib.request.Request(f"{BASE}{path}",
        data=json.dumps(data).encode(), method="POST", headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {APIKEY}"
    })
    with urllib.request.urlopen(req, timeout=20, context=ssl_ctx) as r:
        return json.loads(r.read())

# Get all listings with rehosted heroes from today
listings = api_get("/rest/v1/listings?or=(hero_image.ilike.*google-17738*,hero_image.ilike.*google-17739*)&select=id,name,hero_image,google_place_id&limit=100")
print(f"Found {len(listings)} rehosted heroes from today", flush=True)

fixed = 0
skipped = 0

for l in listings:
    # Check file size via curl (handles SSL properly)
    r = subprocess.run(['curl', '-sI', l['hero_image']], capture_output=True, text=True, timeout=5)
    size = 0
    for line in r.stdout.split('\n'):
        if 'content-length' in line.lower():
            try:
                size = int(line.split(':')[1].strip())
            except:
                pass
            break

    if size >= 100000:
        skipped += 1
        continue

    if not l.get('google_place_id'):
        print(f"  SKIP (no place_id): {l['name']}", flush=True)
        skipped += 1
        continue

    try:
        # Get Google Place photos
        photos_data = api_get(f"/functions/v1/google-place-photos?place_id={l['google_place_id']}&limit=1")
        photos = photos_data.get('photos', [])
        if not photos:
            print(f"  SKIP (no photos): {l['name']}", flush=True)
            skipped += 1
            continue

        # Re-save as hero at full res
        result = api_post("/functions/v1/google-place-photos", {
            'photo_name': photos[0]['name'],
            'listing_id': l['id'],
            'set_as_hero': True,
        })
        if result.get('url'):
            fixed += 1
            print(f"  FIXED ({size//1024}KB -> hi-res): {l['name']}", flush=True)
        else:
            print(f"  ERROR: {l['name']} - {str(result)[:100]}", flush=True)
    except Exception as e:
        print(f"  ERROR: {l['name']} - {e}", flush=True)

print(f"\nDone: {fixed} fixed, {skipped} skipped", flush=True)
