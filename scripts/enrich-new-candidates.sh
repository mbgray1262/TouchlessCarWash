#!/bin/bash
# Stage 3 enrichment for today's newly-classified touchless candidates.
# Runs: enrich-from-google → backfill-amenities → suggest-hero-image → generate-descriptions
# Listings stay is_approved=false throughout — Michael audits before bulk-approval.

KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM5ODM5MiwiZXhwIjoyMDg2OTc0MzkyfQ.L6HkxvOjqGN0GFwUIF-ovbFsjZce61v9jaQRHEzFg0k'
BASE='https://gteqijdpqjmgxfnyuhvy.supabase.co'
LOG=/tmp/enrich_new.log

echo "=== Stage 3 enrichment starting $(date) ===" > $LOG

# Fetch candidate IDs: created today, is_touchless=true, is_approved=false
CANDIDATES=$(curl -s "$BASE/rest/v1/listings?select=id&created_at=gte.2026-04-19T19:00:00Z&is_touchless=eq.true&is_approved=eq.false&limit=200" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" | python3 -c "import sys,json; print(','.join(r['id'] for r in json.load(sys.stdin)))")
COUNT=$(echo "$CANDIDATES" | tr ',' '\n' | wc -l | tr -d ' ')
echo "[Stage 3] $COUNT candidates to enrich" >> $LOG
echo "Candidate IDs: $CANDIDATES" >> $LOG

# ---- Step 1: enrich-from-google (hours, phone, category, place details) ----
echo "" >> $LOG
echo "--- Step 1: enrich-from-google ---" >> $LOG
RESP=$(curl -s -X POST "$BASE/functions/v1/enrich-from-google" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"listing_ids\": [\"$(echo $CANDIDATES | sed 's/,/","/g')\"], \"limit\": 50}" --max-time 300)
echo "$RESP" >> $LOG

# ---- Step 2: backfill-amenities ----
echo "" >> $LOG
echo "--- Step 2: backfill-amenities ---" >> $LOG
RESP=$(curl -s -X POST "$BASE/functions/v1/backfill-amenities" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"limit\": 50}" --max-time 300)
echo "$RESP" >> $LOG

# ---- Step 3: suggest-hero-image (Google Photos → Street View fallback) ----
echo "" >> $LOG
echo "--- Step 3: suggest-hero-image (iterated per listing) ---" >> $LOG
IFS=',' read -ra IDS <<< "$CANDIDATES"
for id in "${IDS[@]}"; do
  R=$(curl -s -X POST "$BASE/functions/v1/suggest-hero-image" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"listing_id\": \"$id\"}" --max-time 60)
  SOURCE=$(echo "$R" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("source","?"))' 2>/dev/null || echo err)
  echo "  $id → $SOURCE" >> $LOG
  sleep 1
done

# ---- Step 4: generate-descriptions (AI unique descriptions) ----
echo "" >> $LOG
echo "--- Step 4: generate-descriptions ---" >> $LOG
RESP=$(curl -s -X POST "$BASE/functions/v1/generate-descriptions" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"limit\": 50, \"only_missing\": true}" --max-time 600)
echo "$RESP" >> $LOG

echo "" >> $LOG
echo "=== Stage 3 enrichment finished $(date) ===" >> $LOG
