/**
 * NATIONAL SELF-SERVE HARVEST (read-only discovery).
 * Queries Google Places for "self service car wash" across US cities (adaptive pagination),
 * dedupes by place_id, and marries results against our existing DB by place_id.
 * Writes NOTHING to the database — saves a dataset + report for review.
 *
 * Safety: hard stop at ~$60 of Places spend.
 * Run: node scripts/selfserve-harvest.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = env.GOOGLE_PLACES_API_KEY;
const COST_PER_CALL = 0.032, COST_CAP = 18;   // this run only; keeps total well under $100
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  // 1) existing place_id -> status (read-only, for marry-up)
  const map = new Map(); { let from = 0; while (true) { const { data } = await sb.from('listings').select('google_place_id,is_touchless,is_approved,is_self_service').not('google_place_id', 'is', null).order('google_place_id').range(from, from + 999); if (!data || !data.length) break; data.forEach(r => map.set(r.google_place_id, r)); from += data.length; if (data.length < 1000) break; } }
  console.log('existing listings with place_id:', map.size.toLocaleString());

  // 2) city list from our own data (where car washes actually are), ranked by listing count
  const tally = new Map(); { let from = 0; while (true) { const { data } = await sb.from('listings').select('city,state').not('city', 'is', null).not('state', 'is', null).order('id').range(from, from + 999); if (!data || !data.length) break; data.forEach(r => { const k = `${r.city}|${r.state}`; tally.set(k, (tally.get(k) || 0) + 1); }); from += data.length; if (data.length < 1000) break; } }
  const cities = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 550).map(([k]) => k);
  console.log('querying top', cities.length, 'cities (page 1 only)\n');

  // 3) harvest — PAGE 1 ONLY (robust, no pagination)
  const results = new Map(); let calls = 0, cityN = 0;
  for (const ck of cities) {
    if (calls * COST_PER_CALL >= COST_CAP) { console.log(`\n[cost cap $${COST_CAP} reached — stopping]`); break; }
    const [city, state] = ck.split('|');
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(`self service car wash in ${city}, ${state}`)}&key=${KEY}`;
    let j; try { j = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json(); } catch { cityN++; continue; }
    calls++;
    if (j.status === 'OK') {
      for (const r of (j.results || [])) {
        if (!results.has(r.place_id)) results.set(r.place_id, { place_id: r.place_id, name: r.name, address: r.formatted_address, rating: r.rating, reviews: r.user_ratings_total, srcCity: `${city}, ${state}` });
      }
    }
    if (++cityN % 100 === 0) { console.log(`  ${cityN}/${cities.length} cities | ${results.size} unique | $${(calls * COST_PER_CALL).toFixed(2)}`); writeFileSync('scripts/_selfserve_harvest.json', JSON.stringify([...results.values()], null, 2)); }
  }

  // 4) marry-up
  let inDb = 0, netNew = 0, mTouch = 0, mSelf = 0, mUntyped = 0, mApproved = 0;
  for (const r of results.values()) { const e = map.get(r.place_id); if (!e) { netNew++; continue; } inDb++; if (e.is_approved === true) mApproved++; if (e.is_self_service === true) mSelf++; else if (e.is_touchless === true) mTouch++; else mUntyped++; }

  writeFileSync('scripts/_selfserve_harvest.json', JSON.stringify([...results.values()], null, 2));
  console.log('\n==================== NATIONAL SELF-SERVE HARVEST ====================');
  console.log(`Cities queried: ${cityN} | Places calls: ${calls} | Spend: ~$${(calls * COST_PER_CALL).toFixed(2)}`);
  console.log(`Unique self-serve washes found: ${results.size.toLocaleString()}`);
  console.log(`\n--- MARRY-UP against our database (nothing written) ---`);
  console.log(`Already in our DB: ${inDb} (${(100 * inDb / results.size).toFixed(0)}%)`);
  console.log(`   ├─ untyped   → add self_serve tag: ${mUntyped}`);
  console.log(`   ├─ touchless → add self_serve alongside (touchless untouched): ${mTouch}`);
  console.log(`   ├─ already self_serve: ${mSelf}`);
  console.log(`   └─ (of matched, currently live/approved: ${mApproved})`);
  console.log(`Net-NEW → import fresh (unapproved, gated): ${netNew} (${(100 * netNew / results.size).toFixed(0)}%)`);
  console.log(`\nDataset saved: scripts/_selfserve_harvest.json  (${results.size} rows)`);
}
main();
