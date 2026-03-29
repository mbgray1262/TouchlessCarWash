#!/usr/bin/env python3
"""
Classify unknown listings by chain name rules.

Usage:
  SUPABASE_SERVICE_KEY=<key> python3 scripts/classify-chains.py [--apply]

Pass --apply to actually write to the DB. Default is dry-run.
"""
import os, sys, json, ssl, urllib.request, time

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78"
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
BASE = "https://gteqijdpqjmgxfnyuhvy.supabase.co"
DRY_RUN = "--apply" not in sys.argv

# ---------------------------------------------------------------------------
# Chain classification rules
# Format: (name_fragment_lowercase, is_touchless, note)
# Matched case-insensitively against listing name via ilike
# ---------------------------------------------------------------------------
NOT_TOUCHLESS = [
    # Confirmed tunnel/friction conveyor chains
    # Format: (fragment, match_mode, note)
    # match_mode: "prefix" = ilike fragment*, "contains" = ilike *fragment*, "exact" = eq
    ("go car wash",         "prefix",   "express tunnel conveyor chain"),
    ("moo moo express",     "prefix",   "express tunnel conveyor chain (Ohio)"),
    ("mike's carwash",      "prefix",   "soft-cloth tunnel chain (Indiana)"),  # no-space variant only
    ("wetgo",               "contains", "WetGo/GetGo friction tunnel system"),
    ("costco car wash",     "prefix",   "express exterior tunnel, friction"),
    # Gas station / regional chains confirmed friction
    ("silverstar car wash", "prefix",   "soft foam brushes confirmed in FAQ"),
    ("tagg-n-go",           "prefix",   "brush contact tunnel confirmed"),
    ("royal farms",         "prefix",   "Soft Touch Wash confirmed at all locations"),
]

TOUCHLESS = [
    # Verified touchless-only chains
    ("holiday stationstores | car wash",  "contains", "verified Touch Free IBA (Holiday Station)"),
    ("holiday stationstores|car wash",    "contains", "verified Touch Free IBA (Holiday Station)"),
    ("washworld",                          "contains", "Washworld brand = touchless IBA equipment"),
    # washtec excluded — "Washtech Inc" in DB is a service company, not a car wash
    # Gas station brands confirmed touchless IBA standard
    ("chevron",  "prefix",   "touchless IBA widely documented as standard across Chevron network"),
    ("mobil",    "prefix",   "touchless IBA documented standard in ExxonMobil network"),
    ("exxon",    "prefix",   "touchless predominant in ExxonMobil network"),
    ("cenex",    "prefix",   "touchless IBA standard for Cenex rural co-op locations"),
]

# ---------------------------------------------------------------------------

def api_get(path, key=ANON_KEY):
    req = urllib.request.Request(f"{BASE}{path}", headers={
        "apikey": key, "Authorization": f"Bearer {key}"
    })
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())

def api_patch(path, data, key):
    body = json.dumps(data).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=body, method="PATCH", headers={
        "Content-Type": "application/json",
        "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "return=minimal",
    })
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return r.status

import urllib.parse

def make_ilike_pattern(fragment, mode):
    if mode == "prefix":
        return urllib.parse.quote(f"{fragment}*")
    elif mode == "exact":
        return urllib.parse.quote(fragment)
    else:  # contains
        return urllib.parse.quote(f"*{fragment}*")

def fetch_matches(fragment, mode):
    """Fetch all unknown listings whose name matches using the given mode."""
    if mode == "exact":
        path = f"/rest/v1/listings?select=id,name,city,state&is_touchless=is.null&name=eq.{urllib.parse.quote(fragment)}&limit=2000"
    else:
        pat = make_ilike_pattern(fragment, mode)
        path = f"/rest/v1/listings?select=id,name,city,state&is_touchless=is.null&name=ilike.{pat}&limit=2000"
    return api_get(path)

def apply_rule(fragment, mode, is_touchless_value, note, service_key):
    listings = fetch_matches(fragment, mode)
    count = len(listings)
    label = "TOUCHLESS" if is_touchless_value else "NOT_TOUCHLESS"

    if count == 0:
        print(f"  [{label}] '{fragment}' — 0 matches, skipping")
        return 0

    print(f"  [{label}] '{fragment}' ({mode}) — {count} matches | {note}")
    for r in listings[:5]:
        print(f"           • {r['name']} — {r['city']}, {r['state']}")
    if count > 5:
        print(f"           … and {count - 5} more")

    if DRY_RUN:
        return count

    # Batch update
    if mode == "exact":
        path = f"/rest/v1/listings?is_touchless=is.null&name=eq.{urllib.parse.quote(fragment)}"
    else:
        pat = make_ilike_pattern(fragment, mode)
        path = f"/rest/v1/listings?is_touchless=is.null&name=ilike.{pat}"

    status = api_patch(path, {
        "is_touchless": is_touchless_value,
        "crawl_notes": f"Chain rule: {note}",
        "crawl_status": "classified",
    }, service_key)
    print(f"           → PATCH status {status}")
    time.sleep(0.3)
    return count

# ---------------------------------------------------------------------------

if DRY_RUN:
    print("=== DRY RUN — pass --apply to write to DB ===\n")
else:
    if not SERVICE_KEY:
        print("ERROR: SUPABASE_SERVICE_KEY env var required for --apply mode")
        sys.exit(1)
    print("=== APPLY MODE — writing to DB ===\n")

total_false = 0
total_true = 0

print("--- NOT TOUCHLESS rules ---")
for fragment, mode, note in NOT_TOUCHLESS:
    n = apply_rule(fragment, mode, False, note, SERVICE_KEY)
    total_false += n

print()
print("--- TOUCHLESS rules ---")
for fragment, mode, note in TOUCHLESS:
    n = apply_rule(fragment, mode, True, note, SERVICE_KEY)
    total_true += n

print()
print(f"=== SUMMARY ===")
print(f"  Would set is_touchless=false: {total_false} listings")
print(f"  Would set is_touchless=true:  {total_true} listings")
if DRY_RUN:
    print("\nRe-run with --apply to commit.")
