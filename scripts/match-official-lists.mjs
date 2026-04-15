#!/usr/bin/env node
/**
 * Cross-references our DB listings against the HARDCODED OFFICIAL Touch Free
 * lists from the April 13 chain import scripts. These are the most authoritative
 * possible evidence — the chains themselves publishing which locations are
 * touchless.
 *
 * Sources (all hardcoded in scripts/import-*.py):
 *   - HOLIDAY_LOCATIONS (Holiday Stationstores Touch Free list)
 *   - POWER_MARKET_LOCATIONS (H&S Energy touchless drive-through list)
 *   - KWIK_TRIP_WI_LOCATIONS (Kwik Trip Touch Free PDF)
 *   - BELLSTORES_LOCATIONS (BellStores touchless locations)
 *   - MISSING_LOCATIONS from import-missing-hns.py (H&S Energy additions)
 *
 * For each matching DB listing (by city + state + address fragment):
 *   - is_touchless = true
 *   - is_approved = true
 *   - touchless_verified = 'chain'
 *   - classification_source = 'chain_official_list_match'
 *
 * This overrides any previous revert — if the chain itself says it's touchless,
 * it's touchless.
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Parse Python list literal like {"address": "...", "city": "...", "state": "..."}
function parsePythonList(scriptContent, varName) {
  const startRe = new RegExp(`${varName}\\s*=\\s*\\[`);
  const m = startRe.exec(scriptContent);
  if (!m) return [];
  // Walk forward to find matching ]
  let depth = 1;
  let i = m.index + m[0].length;
  const listStart = i;
  while (i < scriptContent.length && depth > 0) {
    if (scriptContent[i] === '[') depth++;
    else if (scriptContent[i] === ']') depth--;
    i++;
  }
  const listBody = scriptContent.slice(listStart, i - 1);
  const entries = [];
  const entryRe = /\{\s*"address"\s*:\s*"([^"]+)"\s*,\s*"city"\s*:\s*"([^"]+)"\s*,\s*"state"\s*:\s*"([^"]+)"/g;
  let em;
  while ((em = entryRe.exec(listBody)) !== null) {
    entries.push({ address: em[1], city: em[2], state: em[3] });
  }
  return entries;
}

const chainScriptPath = resolve(repoRoot, 'scripts/import-chain-locations.py');
const bellScriptPath = resolve(repoRoot, 'scripts/import-bellstores.py');
const hnsScriptPath = resolve(repoRoot, 'scripts/import-missing-hns.py');

const chainSource = readFileSync(chainScriptPath, 'utf8');
const bellSource = readFileSync(bellScriptPath, 'utf8');
const hnsSource = readFileSync(hnsScriptPath, 'utf8');

const HOLIDAY = parsePythonList(chainSource, 'HOLIDAY_LOCATIONS').map(e => ({...e, chain: 'Holiday Stationstores'}));
const POWER_MARKET = parsePythonList(chainSource, 'POWER_MARKET_LOCATIONS').map(e => ({...e, chain: 'Power Market'}));
const KWIK_TRIP = parsePythonList(chainSource, 'KWIK_TRIP_WI_LOCATIONS').map(e => ({...e, chain: 'Kwik Trip'}));
const BELL = parsePythonList(bellSource, 'BELLSTORES_LOCATIONS').map(e => ({...e, chain: 'BellStores'}));
const HNS = parsePythonList(hnsSource, 'MISSING_LOCATIONS').map(e => ({...e, chain: null})); // chain inferred per entry

const all = [...HOLIDAY, ...POWER_MARKET, ...KWIK_TRIP, ...BELL, ...HNS];
console.log(`Parsed official Touch Free lists:`);
console.log(`  HOLIDAY_LOCATIONS:      ${HOLIDAY.length}`);
console.log(`  POWER_MARKET_LOCATIONS: ${POWER_MARKET.length}`);
console.log(`  KWIK_TRIP_WI_LOCATIONS: ${KWIK_TRIP.length}`);
console.log(`  BELLSTORES_LOCATIONS:   ${BELL.length}`);
console.log(`  HNS MISSING_LOCATIONS:  ${HNS.length}`);
console.log(`  TOTAL:                  ${all.length}`);

// Normalize address for matching: lowercase, strip punctuation, collapse spaces
function normalizeAddr(s) {
  return (s || '').toLowerCase()
    .replace(/[.,#]/g, '')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bhighway\b/g, 'hwy')
    .replace(/\s+/g, ' ')
    .trim();
}

function addrKey(street, city, state) {
  const streetFrag = normalizeAddr(street).split(' ').slice(0, 3).join(' '); // first 3 tokens (e.g. "702 6th ave")
  const cityN = (city || '').toLowerCase().trim();
  const stateN = (state || '').toUpperCase().trim();
  return `${stateN}|${cityN}|${streetFrag}`;
}

// Build a map of official locations by key
const officialKeys = new Map();
for (const loc of all) {
  const k = addrKey(loc.address, loc.city, loc.state);
  officialKeys.set(k, loc);
}
console.log(`Unique official keys: ${officialKeys.size}`);

// Pull all DB listings — we'll check every one against the official lists (not just reverts)
// Because some might be unclassified or falsely is_touchless=false
const dbListings = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('id, name, address, city, state, parent_chain, is_touchless, is_approved, classification_source')
    .range(offset, offset + 999);
  if (!data || data.length === 0) break;
  dbListings.push(...data);
  if (data.length < 1000) break;
}
console.log(`\nLoaded ${dbListings.length} DB listings`);

// Match
const matches = [];
for (const l of dbListings) {
  const k = addrKey(l.address, l.city, l.state);
  if (officialKeys.has(k)) {
    const official = officialKeys.get(k);
    matches.push({ listing: l, official });
  }
}

console.log(`\nMatches against official Touch Free lists: ${matches.length}`);
const byCurrentState = { alreadyTouchless: 0, notTouchless: 0, unknown: 0 };
for (const m of matches) {
  if (m.listing.is_touchless === true) byCurrentState.alreadyTouchless++;
  else if (m.listing.is_touchless === false) byCurrentState.notTouchless++;
  else byCurrentState.unknown++;
}
console.log(`  Already is_touchless=true: ${byCurrentState.alreadyTouchless}`);
console.log(`  Currently is_touchless=false (needs restore): ${byCurrentState.notTouchless}`);
console.log(`  Currently is_touchless=null: ${byCurrentState.unknown}`);

// Update every match to definitive touchless=true
const toUpdate = matches.filter(m => m.listing.is_touchless !== true || m.listing.is_approved !== true);
console.log(`\nTo update (set is_touchless=true authoritatively): ${toUpdate.length}`);

let done = 0;
for (let i = 0; i < toUpdate.length; i += 200) {
  const batch = toUpdate.slice(i, i + 200);
  for (const m of batch) {
    const { error } = await sb.from('listings').update({
      is_touchless: true, is_approved: true,
      touchless_verified: 'chain',
      classification_source: 'chain_official_list_match',
      crawl_notes: `Confirmed touchless via official chain list match: ${m.official.chain || m.listing.parent_chain || 'H&S Energy'}`,
    }).eq('id', m.listing.id);
    if (!error) done++;
  }
}
console.log(`Updated: ${done}`);

const { count: total } = await sb.from('listings').select('*',{count:'exact',head:true}).eq('is_touchless', true);
console.log(`\nTotal touchless now: ${total}`);
