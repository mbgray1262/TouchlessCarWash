#!/usr/bin/env node
/**
 * One-shot SerpAPI test — verifies Google Maps engine works, shows response
 * shape + credit cost, before we run the full 103-metro sweep.
 *
 * Costs: 3 credits (1 metro × 3 queries).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  resolve(__dirname, '../.env.local'),
  '/Users/michaelgray/Projects/TouchlessCarWash/.env.local',
];
const envPath = envCandidates.find(p => { try { readFileSync(p, 'utf8'); return true; } catch { return false; } });
const env = readFileSync(envPath, 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...r] = l.split('='); if (k) a[k.trim()] = r.join('=').trim(); return a; }, {});

const apiKey = env.SERPAPI_KEY;
if (!apiKey) { console.error('Missing SERPAPI_KEY'); process.exit(1); }

// Miami metro center, zoom 12 ~ 8-mile radius
const METRO = { name: 'Miami', lat: 25.7617, lng: -80.1918, zoom: 12 };
const QUERIES = ['touchless car wash', 'laser car wash', 'brushless car wash'];

for (const q of QUERIES) {
  const params = new URLSearchParams({
    engine: 'google_maps',
    q,
    ll: `@${METRO.lat},${METRO.lng},${METRO.zoom}z`,
    type: 'search',
    api_key: apiKey,
  });
  const url = `https://serpapi.com/search.json?${params}`;
  console.log(`\n=== ${METRO.name} — "${q}" ===`);
  const res = await fetch(url);
  if (!res.ok) { console.error('HTTP', res.status, await res.text()); continue; }
  const json = await res.json();
  const results = json.local_results || [];
  console.log(`  ${results.length} places returned`);
  for (const p of results.slice(0, 5)) {
    console.log(`    ${p.title} | ${p.address || ''} | place_id=${p.place_id || '?'} | rating=${p.rating || '—'} (${p.reviews || 0} reviews)`);
  }
  // Show full shape of first result so we know what's available
  if (q === QUERIES[0] && results[0]) {
    console.log('\n  First result keys:', Object.keys(results[0]).join(', '));
  }
  // Check remaining credits
  if (json.search_metadata?.total_time_taken) {
    // SerpAPI puts credit info in account endpoint, not in result — log time only
    console.log('  Time:', json.search_metadata.total_time_taken, 's');
  }
}

// Check credit balance via account endpoint
const acctUrl = `https://serpapi.com/account.json?api_key=${apiKey}`;
const acct = await (await fetch(acctUrl)).json();
console.log('\n=== Account ===');
console.log('  Plan:', acct.plan_name || acct.plan_id);
console.log('  Searches remaining this month:', acct.plan_searches_left ?? acct.searches_per_month - (acct.searches_performed || 0));
console.log('  Searches used this month:', acct.searches_performed || acct.this_month_usage);
