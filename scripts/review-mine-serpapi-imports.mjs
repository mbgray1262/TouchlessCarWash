#!/usr/bin/env node
/**
 * Runs review-mine (scan_single) only against listings we just imported from
 * the SerpAPI discovery sweep. Processes high-confidence first (obvious
 * touchless name), then low-confidence by review count.
 *
 * Budget: ~190 listings × 2 SerpAPI calls = 380 credits (of 385 available).
 * Accepts --limit N to cap the run.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = [resolve(repoRoot, '.env.local'), '/Users/michaelgray/Projects/TouchlessCarWash/.env.local']
  .find(p => { try { readFileSync(p,'utf8'); return true; } catch { return false; } });
const env = readFileSync(envPath,'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(SUPABASE_URL, ANON_KEY);

const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '190', 10);
const DELAY_MS = 1200;

// Load shortlist place_ids in priority order (high-confidence first, then by reviews)
function parseCsvLine(line) {
  const cells = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) { if (c === '"' && line[i+1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c; }
    else { if (c === '"') inQ = true; else if (c === ',') { cells.push(cur); cur = ''; } else cur += c; }
  }
  cells.push(cur); return cells;
}
const csv = readFileSync(resolve(repoRoot, 'scripts/discovery-output/serpapi-shortlist.csv'), 'utf8');
const lines = csv.split('\n').filter(Boolean);
const headers = lines[0].split(',');
const shortlist = lines.slice(1).map(l => { const cells = parseCsvLine(l); const o = {}; headers.forEach((h,i)=>o[h]=cells[i]); return o; });

// Already sorted by confidence + score in the shortlist CSV; just take place_ids in order
const targetPlaceIds = shortlist.slice(0, LIMIT * 2).map(c => c.place_id); // fetch 2× buffer for dupes/skips

// Fetch matching listing rows
const { data: listings, error } = await sb.from('listings')
  .select('id, name, city, state, review_count, google_place_id, review_mine_status')
  .in('google_place_id', targetPlaceIds)
  .is('is_touchless', null)
  .is('review_mine_status', null);
if (error) { console.error('DB query failed:', error); process.exit(1); }

// Re-order to match shortlist priority
const orderIdx = new Map(targetPlaceIds.map((p, i) => [p, i]));
listings.sort((a, b) => (orderIdx.get(a.google_place_id) ?? 999999) - (orderIdx.get(b.google_place_id) ?? 999999));

const toScan = listings.slice(0, LIMIT);
console.log(`Scanning ${toScan.length} newly-imported listings (of ${listings.length} eligible)`);
console.log(`Estimated SerpAPI cost: ~${toScan.length * 2} credits`);

async function scanSingle(listingId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/review-mine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ action: 'scan_single', listing_id: listingId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

let foundTouchless = 0, notTouchless = 0, noReviews = 0, errors = 0, consecutiveErrors = 0;
const start = Date.now();

for (let i = 0; i < toScan.length; i++) {
  const l = toScan[i];
  try {
    const result = await scanSingle(l.id);
    const status = result.status || 'unknown';
    if (status === 'touchless_found') { foundTouchless++; console.log(`  ✓ ${l.name} — ${l.city}, ${l.state}`); }
    else if (status === 'not_touchless') { notTouchless++; }
    else if (status === 'no_reviews' || status === 'error') { noReviews++; }
    consecutiveErrors = 0;
  } catch (e) {
    errors++; consecutiveErrors++;
    console.error(`  ! ${l.name}: ${e.message.slice(0, 100)}`);
    if (consecutiveErrors >= 5) { console.error('Too many consecutive errors, stopping.'); break; }
    await new Promise(r => setTimeout(r, 3000));
    continue;
  }
  if ((i + 1) % 20 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    console.log(`  [${i+1}/${toScan.length}] touchless:${foundTouchless} not:${notTouchless} noReviews:${noReviews} err:${errors} · ${elapsed}s`);
  }
  await new Promise(r => setTimeout(r, DELAY_MS));
}

// Check credits remaining
const SERPAPI_KEY = env.SERPAPI_KEY;
const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${SERPAPI_KEY}`)).json();
console.log(`\n=== Done ===`);
console.log(`Touchless confirmed:  ${foundTouchless}`);
console.log(`Not touchless:        ${notTouchless}`);
console.log(`No reviews/skipped:   ${noReviews}`);
console.log(`Errors:               ${errors}`);
console.log(`Credits remaining:    ${acct.plan_searches_left}`);
