#!/usr/bin/env python3
"""
Drive a description-generation job to completion.
Resumes an existing job_id or starts a new one.

Usage:
  python3 scripts/drive-descriptions.py [--job JOB_ID]

Logs to: scripts/drive-descriptions.log
"""
import json, os, ssl, sys, time, datetime, urllib.request, urllib.error

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78"
URL = "https://gteqijdpqjmgxfnyuhvy.supabase.co/functions/v1/generate-descriptions"
LOG = os.path.join(os.path.dirname(__file__), "drive-descriptions.log")

def log(m):
    ts = datetime.datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {m}"
    print(line, flush=True)
    with open(LOG, "a") as f: f.write(line + "\n")

def post(body):
    req = urllib.request.Request(URL,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {ANON}"},
        method="POST")
    return json.loads(urllib.request.urlopen(req, timeout=120, context=ssl_ctx).read())

job_id = None
for i, a in enumerate(sys.argv):
    if a == "--job" and i + 1 < len(sys.argv):
        job_id = sys.argv[i+1]

if not job_id:
    log("Starting new description job...")
    r = post({"action": "start"})
    job_id = r["job_id"]
    total = r.get("total", 0)
    log(f"Job {job_id}: {total} listings")
else:
    log(f"Resuming job {job_id}")
    total = 0

done_count = fail_count = 0
consecutive_errors = 0
start = time.time()

while True:
    try:
        r = post({"action": "process_batch", "job_id": job_id})
        consecutive_errors = 0
        if r.get("done"):
            elapsed = time.time() - start
            log(f"✅ COMPLETE: processed={done_count} failed={fail_count} | elapsed={elapsed/60:.1f}m")
            break
        if r.get("success"):
            done_count += 1
            if done_count % 10 == 0:
                rate = done_count / ((time.time() - start) / 60)
                log(f"  progress: {done_count} generated | rate: {rate:.1f}/min | failed: {fail_count}")
        else:
            fail_count += 1
            log(f"  ⚠️  fail: {r.get('error', 'unknown')[:100]}")
        time.sleep(0.4)
    except urllib.error.HTTPError as e:
        consecutive_errors += 1
        log(f"  HTTP {e.code}: {e.read().decode()[:200]}")
        if consecutive_errors > 5:
            log("❌ Too many errors, exiting")
            break
        time.sleep(10)
    except Exception as e:
        consecutive_errors += 1
        log(f"  Exception: {e}")
        if consecutive_errors > 5:
            log("❌ Too many errors, exiting")
            break
        time.sleep(10)
