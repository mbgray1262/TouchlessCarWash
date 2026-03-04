#!/bin/bash
# Drive city description generation by calling the edge function in a loop
# Usage: ./scripts/drive-city-descriptions.sh <job_id>

JOB_ID="${1:-b461ac9f-3163-4481-96de-78d48f01ae8d}"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78"
URL="https://gteqijdpqjmgxfnyuhvy.supabase.co/functions/v1/generate-city-descriptions"
COMPLETED=0
FAILED=0

echo "Starting batch driver for job $JOB_ID"

while true; do
  result=$(curl -s "$URL" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"process_batch\",\"job_id\":\"$JOB_ID\"}" 2>/dev/null)

  # Check if done
  if echo "$result" | grep -q '"done"'; then
    echo "Job complete! Completed: $COMPLETED, Failed: $FAILED"
    break
  fi

  success=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))" 2>/dev/null)
  city=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('city',''))" 2>/dev/null)

  if [ "$success" = "True" ]; then
    COMPLETED=$((COMPLETED + 1))
    echo "[$COMPLETED] OK: $city"
  else
    FAILED=$((FAILED + 1))
    error=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null)
    echo "[$COMPLETED] FAIL: $city - $error"
  fi

  sleep 0.5
done
