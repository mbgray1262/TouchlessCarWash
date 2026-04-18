#!/bin/bash
# Full verify pipeline — runs after phase-1 GMaps scraper completes:
#   Phase 2: GMaps scraper on 548 approved-but-no-reviews listings
#   Phase 3: text-verifier with --include-approved to apply findings
#
# Sleeps until current phase-1 scraper process exits, then runs phase 2
# serially so we don't overload Chrome.
#
# Usage: nohup bash scripts/full-verify-pipeline.sh > scripts/pipeline.log 2>&1 &
set -u
cd "$(dirname "$0")/.."

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ====== Wait for phase 1 (held scraper) to finish ======
log 'Waiting for phase 1 (scrape-gmaps-reviews.py --mode=held) to finish...'
while pgrep -f "scrape-gmaps-reviews.py" >/dev/null; do
  sleep 60
done
log 'Phase 1 done.'

# ====== Phase 1.5: re-run text verifier on held to apply new evidence ======
log 'Phase 1.5: text-verifier on held listings'
python3 scripts/verify-held-browser.py 2>&1 | tail -15
log 'Phase 1.5 done.'

# ====== Phase 2: GMaps scraper on approved-but-no-reviews ======
log 'Phase 2: GMaps scraper on approved-no-reviews'
python3 scripts/scrape-gmaps-reviews.py --mode=approved-no-reviews 2>&1 | tail -15
log 'Phase 2 done.'

# ====== Phase 3: text-verifier with --include-approved ======
log 'Phase 3: text-verifier w/ approved reassessment'
python3 scripts/verify-held-browser.py --include-approved 2>&1 | tail -20
log 'Phase 3 done.'

# ====== Final DB snapshot ======
log '== Final counts =='
node --input-type=module -e "
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const q = async (f) => (await sb.from('listings').select('*',{count:'exact',head:true}).match(f)).count;
console.log('Approved:', await q({is_touchless:true,is_approved:true}));
console.log('Held:    ', await q({is_touchless:true,is_approved:false}));
"
log 'Pipeline complete.'
