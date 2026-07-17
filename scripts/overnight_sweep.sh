#!/bin/bash
# Overnight self-serve photo sweep — SAFE, unattended, resumable.
# For each chunk of pre-launch (is_approved=false), non-curated, harvestable self-serve listings:
#   1) browser-harvest the FULL Google gallery (checkpointed, skips already-done)
#   2) score every photo with Gemini → pick a hero OR de-classify if no bay/arch evidence
# Never touches: live listings, manual/curated heroes, is_approved, is_touchless.
# Progress: /tmp/overnight_progress.log   Detail: /tmp/overnight.log   Resume key: /tmp/overnight_done.txt
cd /Users/michaelgray/Projects/TouchlessCarWash || exit 1
CHUNK=40
echo "[$(date '+%m-%d %H:%M')] overnight sweep START" >> /tmp/overnight_progress.log
while true; do
  IDS=$(node scripts/_overnight_next.mjs $CHUNK 2>>/tmp/overnight.log)
  if [ "$IDS" = "DONE" ] || [ -z "$IDS" ]; then
    echo "[$(date '+%m-%d %H:%M')] ALL DONE — no more listings" >> /tmp/overnight_progress.log
    break
  fi
  NUM=$(echo "$IDS" | tr ',' '\n' | grep -c .)
  echo "[$(date '+%m-%d %H:%M')] chunk of $NUM starting" >> /tmp/overnight_progress.log
  # 1) harvest (checkpoints per-listing into scripts/_gallery_urls.json; failures are non-fatal)
  cat /tmp/chunk.json | python3 scripts/maps_gallery.py --stdin >>/tmp/overnight.log 2>&1
  # 2) score + apply this chunk
  node scripts/selfserve-hero-select.mjs --ids "$IDS" --apply >>/tmp/overnight.log 2>&1
  # mark this chunk done (so we advance even if a listing errored — morning review catches gaps)
  echo "$IDS" | tr ',' '\n' >> /tmp/overnight_done.txt
  H=$(grep -c '✅' /tmp/overnight.log); X=$(grep -c 'NOT SELF-SERVICE' /tmp/overnight.log)
  echo "[$(date '+%m-%d %H:%M')] chunk done | cumulative heroes=$H declassified=$X processed=$(grep -c . /tmp/overnight_done.txt)" >> /tmp/overnight_progress.log
done
