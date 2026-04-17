#!/usr/bin/env node
/**
 * Generic chain reconciler. For a chain with authoritative location data:
 *   - Revert any DB listings for that chain NOT on the authoritative list
 *   - Ensure DB listings matching authoritative addresses are correctly
 *     classified as touchless (chain-verified)
 *   - Report authoritative addresses missing from the DB
 *
 * Usage: edit the CHAIN_DATA block below then run. Addresses must include
 * at minimum: streetNumber (3 digits), streetName (first word distinctive),
 * city, state. Matching is fuzzy on (state === AND city contains AND
 * address contains streetNumber AND address contains streetName).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const ARG_CHAIN = process.argv[2];  // e.g. "autowash"
const EXECUTE = process.argv.includes('--execute');

// Authoritative location data for each chain, scraped from their own sites.
// For large chains, locations can be loaded from a separate JSON file.
function loadLocationsFromJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return []; }
}

const CHAIN_DATA = {
  'super-wash': {
    name: "Super Wash",
    name_pattern: /^super\s*wash\b/i,
    source_url: 'https://www.superwash.com/locations/',
    locations: loadLocationsFromJson('scripts/discovery-output/super-wash-locations.json'),
  },
  cobblestone: {
    name: "Cobblestone",
    // Cobblestone locations use names like "Cobblestone Car Wash", "Cobblestone Auto Spa"
    name_pattern: /^cobblestone\b/i,
    source_url: 'https://cobblestone.com/locations/',
    locations: loadLocationsFromJson('scripts/discovery-output/cobblestone-locations.json'),
  },
  'brown-bear': {
    name: "Brown Bear",
    name_pattern: /^brown\s+bear\b/i,
    source_url: 'https://brownbear.com/',
    locations: loadLocationsFromJson('scripts/discovery-output/brown-bear-locations.json'),
  },
  elephant: {
    name: "Elephant Car Wash",
    name_pattern: /^elephant\s+car\s+wash\b/i,
    source_url: 'https://elephantcarwash.com/',
    locations: loadLocationsFromJson('scripts/discovery-output/elephant-locations.json'),
  },
  scrubadub: {
    name: "ScrubaDub",
    // Match both "ScrubaDub" and "Scruba Dub" variants
    name_pattern: /^scrub[a\s]*dub/i,
    source_url: 'https://www.scrubadub.com/',
    // Derived from URL slugs — num is empty, matcher falls back to city+state+key
    locations: loadLocationsFromJson('scripts/discovery-output/scrubadub-locations.json'),
  },
  autowash: {
    name: "Autowash",
    // Strict pattern: must start with "Autowash" (not just contain) OR contain "Autowash @"
    name_pattern: /^autowash\b|\bautowash\s*@/i,
    source_url: 'https://autowashco.com/locations/',
    locations: [
      { street: '10253 W Chatfield Ave',   city: 'Littleton',       state: 'CO', num: '10253', key: 'chatfield' },
      { street: '8804 S. Colorado Blvd',   city: 'Highlands Ranch', state: 'CO', num: '8804',  key: 'colorado' },
      { street: '5900 W. 44th Ave',        city: 'Wheat Ridge',     state: 'CO', num: '5900',  key: '44th' },
      { street: '730 Heritage Rd',         city: 'Golden',          state: 'CO', num: '730',   key: 'heritage' },
      { street: '14835 W. 64th Ave',       city: 'Arvada',          state: 'CO', num: '14835', key: '64th' },
      { street: '7581 Shaffer Pkwy',       city: 'Littleton',       state: 'CO', num: '7581',  key: 'shaffer' },
      { street: '9809 W. Coal Mine Ave',   city: 'Littleton',       state: 'CO', num: '9809',  key: 'coal mine' },
      { street: '7569 W. 92nd Ave',        city: 'Westminster',     state: 'CO', num: '7569',  key: '92nd' },
      { street: '10087 W. Remington Ave',  city: 'Littleton',       state: 'CO', num: '10087', key: 'remington' },
      { street: '530 Commons Dr',          city: 'Erie',            state: 'CO', num: '530',   key: 'commons' },
      { street: '4221 John F Kennedy Pkwy',city: 'Fort Collins',    state: 'CO', num: '4221',  key: 'kennedy' },
      { street: '16255 Washington St',     city: 'Thornton',        state: 'CO', num: '16255', key: 'washington' },
      { street: '1420 Main St',            city: 'Longmont',        state: 'CO', num: '1420',  key: 'main' },
      { street: '3614 Manhattan Ave',      city: 'Fort Collins',    state: 'CO', num: '3614',  key: 'manhattan' },
      { street: '2102 Midpoint Dr',        city: 'Fort Collins',    state: 'CO', num: '2102',  key: 'midpoint' },
      { street: '1150 Eagle Dr',           city: 'Loveland',        state: 'CO', num: '1150',  key: 'eagle' },
    ],
  },
};

const chainInfo = CHAIN_DATA[ARG_CHAIN];
if (!chainInfo) {
  console.log(`Usage: node scripts/reconcile-chain.mjs <chain-slug> [--execute]`);
  console.log(`Available chains: ${Object.keys(CHAIN_DATA).join(', ')}`);
  process.exit(1);
}

console.log(`=== Reconciling ${chainInfo.name} ===`);
console.log(`Authoritative: ${chainInfo.locations.length} locations from ${chainInfo.source_url}\n`);

// Match: state AND city-first-word contained AND address contains num (if given)
// AND address contains key.
// If num is empty (e.g. URL-slug-derived where we don't have the number),
// match on city + state + key only.
function matchAuth(listing, auth) {
  if (listing.state !== auth.state) return false;
  const c = (listing.city || '').toLowerCase();
  if (!c.includes(auth.city.toLowerCase().split(' ')[0])) return false;
  const addr = (listing.address || '').toLowerCase();
  const numOK = !auth.num || addr.includes(auth.num);
  const keyOK = !auth.key || addr.includes(auth.key.toLowerCase());
  return numOK && keyOK;
}

// Pull listings likely owned by this chain. Strict matching — we require:
//   - parent_chain = chain name, OR
//   - name matches a STRICT pattern (name_pattern from CHAIN_DATA)
// Without strict matching, unrelated businesses named "X Autowash" get caught.
const { data: allRaw } = await sb.from('listings')
  .select('id, name, address, city, state, is_touchless, is_approved, parent_chain, classification_source')
  .or(`parent_chain.eq.${chainInfo.name},name.ilike.%${chainInfo.name}%`);

const all = allRaw.filter(l =>
  l.parent_chain === chainInfo.name ||
  (chainInfo.name_pattern && chainInfo.name_pattern.test(l.name))
);

console.log(`${all.length} listings matching chain (strict filter)\n`);

const matched = [];
const unmatched = [];
for (const l of all) {
  const auth = chainInfo.locations.find(a => matchAuth(l, a));
  if (auth) matched.push({ ...l, matchedAddress: auth.street });
  else unmatched.push(l);
}

console.log(`MATCHED to authoritative list: ${matched.length}`);
for (const l of matched) {
  console.log(`  ✅ ${l.name.slice(0,30).padEnd(30)} ${l.address?.slice(0,30)} / ${l.city}, ${l.state}  t=${l.is_touchless} a=${l.is_approved}`);
}

console.log(`\nUNMATCHED (not in authoritative list): ${unmatched.length}`);
for (const l of unmatched) {
  console.log(`  ❌ ${l.name.slice(0,30).padEnd(30)} ${l.address?.slice(0,30) || '(none)'} / ${l.city}, ${l.state}  t=${l.is_touchless} a=${l.is_approved}`);
}

// Authoritative addresses missing from DB
console.log(`\nAuthoritative locations NOT in DB:`);
let missingCount = 0;
for (const auth of chainInfo.locations) {
  const found = matched.some(m => m.matchedAddress === auth.street);
  if (!found) {
    console.log(`  ⚠️ MISSING  ${auth.street} / ${auth.city}, ${auth.state}`);
    missingCount++;
  }
}
console.log(`(${missingCount} missing)\n`);

if (!EXECUTE) {
  console.log(`(DRY RUN — rerun with --execute to apply)`);
  process.exit(0);
}

// Revert unmatched that are currently touchless
const toRevert = unmatched.filter(l => l.is_touchless === true);
if (toRevert.length > 0) {
  const ids = toRevert.map(l => l.id);
  const { error } = await sb.from('listings').update({
    is_touchless: false,
    is_approved: false,
    touchless_verified: null,
    classification_source: `reverted_apr17_${ARG_CHAIN}_not_in_authoritative`,
    crawl_notes: `Reverted: ${chainInfo.name} official list at ${chainInfo.source_url} does not include this address. Likely misclassified or closed location.`,
  }).in('id', ids);
  if (error) console.error(error);
  else console.log(`✅ Reverted ${ids.length} unmatched-touchless listings`);
}

// Ensure matched are correctly set
const toFix = matched.filter(l => !l.is_touchless || !l.is_approved);
if (toFix.length > 0) {
  const ids = toFix.map(l => l.id);
  const { error } = await sb.from('listings').update({
    is_touchless: true,
    touchless_verified: 'chain',
    parent_chain: chainInfo.name,
    classification_source: `verified_apr17_${ARG_CHAIN}_authoritative`,
    crawl_notes: `Verified: This address is on ${chainInfo.name}'s official location list at ${chainInfo.source_url}. Chain-verified touchless.`,
  }).in('id', ids);
  if (error) console.error(error);
  else console.log(`✅ Fixed ${ids.length} matched-but-misclassified listings`);
}
