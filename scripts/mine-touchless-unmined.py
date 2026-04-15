#!/usr/bin/env python3
"""
Mine reviews for is_touchless=true listings that have NOT yet been mined.

Purpose: corroborate/contradict existing touchless tags with customer review
evidence. Tracks hit rate (touchless_found vs scanned_clean) so the operator
can decide whether more SerpAPI credits are worth buying.

Usage:
  python3 scripts/mine-touchless-unmined.py [--limit N]

Logs to: scripts/mine-touchless-unmined.log
"""
import os, sys, json, ssl, urllib.request, urllib.parse, time, datetime

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78"
BASE = "https://gteqijdpqjmgxfnyuhvy.supabase.co"
LIMIT = 400
for i, arg in enumerate(sys.argv):
    if arg == "--limit" and i + 1 < len(sys.argv):
        LIMIT = int(sys.argv[i + 1])
DRY = "--dry-run" in sys.argv

LOG = os.path.join(os.path.dirname(__file__), "mine-touchless-unmined.log")
DELAY = 1.2  # seconds between calls

def log(m):
    ts = datetime.datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {m}"
    print(line, flush=True)
    with open(LOG, "a") as f: f.write(line + "\n")

def api_get(path):
    req = urllib.request.Request(BASE + path,
        headers={"apikey": ANON, "Authorization": f"Bearer {ANON}"})
    return json.loads(urllib.request.urlopen(req, timeout=30, context=ssl_ctx).read())

def scan_single(listing_id):
    body = json.dumps({"action": "scan_single", "listing_id": listing_id}).encode()
    req = urllib.request.Request(f"{BASE}/functions/v1/review-mine",
        data=body,
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {ANON}"})
    return json.loads(urllib.request.urlopen(req, timeout=60, context=ssl_ctx).read())

# Target: is_touchless=true, review_mine_status IS NULL, has google_place_id,
# has at least some reviews (otherwise mining returns nothing useful).
log("=" * 70)
log(f"MINING TOUCHLESS-TAGGED UNMINED LISTINGS (limit={LIMIT}, dry={DRY})")
log("=" * 70)

log("Loading candidates...")
all_rows = []
offset = 0
while True:
    rows = api_get(
        f"/rest/v1/listings?select=id,name,city,state,review_count,parent_chain"
        f"&is_touchless=eq.true&review_mine_status=is.null"
        f"&google_place_id=not.is.null&review_count=gte.0"
        f"&order=review_count.desc.nullslast"
        f"&limit=1000&offset={offset}"
    )
    if not rows: break
    all_rows.extend(rows)
    if len(rows) < 1000: break
    offset += 1000

log(f"  Candidates available: {len(all_rows)}")
all_rows = all_rows[:LIMIT]
log(f"  Processing: {len(all_rows)}")
log(f"  Estimated SerpAPI calls: ~{len(all_rows) * 2} (scan_single uses ~2 per listing)")
log("")

if DRY:
    for r in all_rows[:20]:
        log(f"  [dry] would mine {r['id'][:8]} | {r['name'][:30]} | {r.get('city','')}, {r.get('state','')}")
    sys.exit(0)

# Process each, tracking hit rate
hits = misses = errors = 0
start = time.time()
for i, listing in enumerate(all_rows, 1):
    try:
        result = scan_single(listing["id"])
        status = result.get("status", "?")
        if status == "touchless_found":
            hits += 1
            marker = "✅ HIT"
        elif status == "scanned_clean":
            misses += 1
            marker = "⚪ miss"
        elif status == "error" or result.get("error"):
            errors += 1
            marker = "❌ err"
        else:
            misses += 1
            marker = f"? {status}"

        # Running hit rate
        total_done = hits + misses
        rate = (hits / total_done * 100) if total_done else 0
        log(f"  [{i:>4}/{len(all_rows)}] {marker} | {listing['name'][:28]:<28} "
            f"{listing.get('city','')[:15]:<15} {listing.get('state',''):>2} | "
            f"hit rate: {hits}/{total_done} ({rate:.1f}%)")
    except Exception as e:
        errors += 1
        log(f"  [{i:>4}/{len(all_rows)}] ❌ EXCEPTION: {e}")

    # Pace
    time.sleep(DELAY)

    # Periodic status
    if i % 50 == 0:
        elapsed = time.time() - start
        eta = (elapsed / i) * (len(all_rows) - i)
        log(f"  --- Progress: {i}/{len(all_rows)} | hits={hits} misses={misses} errors={errors} | "
            f"elapsed={elapsed/60:.1f}m | ETA={eta/60:.1f}m ---")

elapsed = time.time() - start
total = hits + misses
log("")
log("=" * 70)
log(f"MINING COMPLETE")
log("=" * 70)
log(f"  Listings processed: {len(all_rows)}")
log(f"  Hits (touchless_found):   {hits}  ({hits/max(total,1)*100:.1f}%)")
log(f"  Misses (scanned_clean):   {misses}  ({misses/max(total,1)*100:.1f}%)")
log(f"  Errors:                   {errors}")
log(f"  Elapsed: {elapsed/60:.1f} min")
log(f"  SerpAPI calls used: ~{len(all_rows) * 2}")
