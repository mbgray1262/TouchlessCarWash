#!/usr/bin/env python3
"""
Overnight review mining runner.

Loops scan_batch (all_listings=true) until all unscanned listings are processed.
Covers two queues in one pass:
  1. Unknown listings (is_touchless=null) — for classification
  2. Classified touchless listings (is_touchless=true) — for review snippet enrichment

Each scan_batch call processes 50 listings in parallel via DataForSEO.
Estimated time: ~2–4 hours for ~5,879 listings.

Logs to: scripts/review-mining-overnight.log
"""
import os, sys, json, ssl, urllib.request, time, datetime

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

BASE = "https://gteqijdpqjmgxfnyuhvy.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78"

LOG_PATH = os.path.join(os.path.dirname(__file__), "review-mining-overnight.log")

# --- Logging ----------------------------------------------------------------

def log(msg):
    ts = datetime.datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_PATH, "a") as f:
        f.write(line + "\n")

# --- API call ---------------------------------------------------------------

def scan_batch():
    body = json.dumps({
        "action": "scan_batch",
        "batch_size": 50,
        "all_listings": True,
    }).encode()
    req = urllib.request.Request(
        f"{BASE}/functions/v1/review-mine",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ANON_KEY}",
        }
    )
    with urllib.request.urlopen(req, timeout=150, context=ssl_ctx) as r:
        return json.loads(r.read())

# --- Main loop --------------------------------------------------------------

log("=" * 60)
log("Overnight review mining started")
log("Processing all unscanned listings (unknowns + classified touchless)")
log("=" * 60)

batch_num = 0
total_scanned = 0
total_touchless_found = 0
total_errors = 0
consecutive_errors = 0
start_time = time.time()

while True:
    batch_num += 1
    batch_start = time.time()

    try:
        result = scan_batch()
        consecutive_errors = 0

        scanned = result.get("scanned_this_batch", 0)
        found = result.get("found_touchless", 0)
        ai_rejected = result.get("ai_rejected", 0)
        total_remaining = result.get("total_remaining", "?")
        complete = result.get("complete", False)

        total_scanned += scanned
        total_touchless_found += found

        elapsed_batch = time.time() - batch_start
        elapsed_total = time.time() - start_time

        log(
            f"Batch {batch_num}: scanned={scanned} touchless={found} "
            f"ai_rejected={ai_rejected} remaining={total_remaining} "
            f"({elapsed_batch:.0f}s)"
        )

        # Log newly found touchless listings
        for r in result.get("results", []):
            if r.get("status") == "touchless_found":
                log(f"  ✓ TOUCHLESS: {r['name']} — {r['city']}, {r['state']} ({r['reviewCount']} snippets)")
            elif r.get("status") == "ai_rejected":
                log(f"  ✗ REJECTED:  {r['name']} — {r['city']}, {r['state']}")
            elif r.get("status") == "error":
                total_errors += 1
                log(f"  ! ERROR:     {r['name']} — {r['city']}, {r['state']}")

        # Progress summary every 10 batches
        if batch_num % 10 == 0:
            elapsed_min = elapsed_total / 60
            rate = total_scanned / elapsed_total if elapsed_total > 0 else 0
            log(f"  --- Progress: {total_scanned} scanned, {total_touchless_found} touchless found, "
                f"{total_errors} errors | {elapsed_min:.0f}m elapsed | {rate:.1f}/s ---")

        if complete or scanned == 0:
            elapsed_min = (time.time() - start_time) / 60
            log("=" * 60)
            log(f"COMPLETE in {elapsed_min:.0f} minutes!")
            log(f"  Total scanned:        {total_scanned}")
            log(f"  Touchless found:      {total_touchless_found}")
            log(f"  Errors:               {total_errors}")
            log("=" * 60)
            break

    except KeyboardInterrupt:
        elapsed_min = (time.time() - start_time) / 60
        log(f"\nStopped by user after {elapsed_min:.0f} minutes, {batch_num} batches")
        log(f"  Scanned: {total_scanned}, Touchless: {total_touchless_found}")
        break
    except Exception as e:
        consecutive_errors += 1
        log(f"  ! BATCH ERROR (#{consecutive_errors}): {e}")
        if consecutive_errors >= 5:
            log("Too many consecutive errors — stopping.")
            break
        wait = min(30 * consecutive_errors, 120)
        log(f"  Retrying in {wait}s...")
        time.sleep(wait)
        continue

    # Brief pause between batches to be a good citizen
    time.sleep(3)
