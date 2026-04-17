#!/usr/bin/env node
/**
 * Reconcile Haffner's listings against the authoritative touchless list
 * from haffners.com/car-washes/Touchless-Car-Washes.
 *
 * Haffner's has exactly 7 touchless locations:
 *   - 374 Tenney Mountain Highway, Plymouth NH
 *   - 73 Plaistow Road, Haverhill MA
 *   - 55 Riverside Street, Portland ME
 *   - 131 Commerce Way, Plymouth MA
 *   - 309 NH-104, New Hampton NH
 *   - 425 Merrimack Street, Lawrence MA
 *   - 75 Route 101A, Amherst NH
 *
 * Actions:
 *   - For each current Haffner's listing marked touchless:
 *     - If address matches authoritative list → keep + verify chain flag
 *     - If address DOES NOT match → revert (it's a different Haffner's
 *       location, likely gas-station-only or not touchless)
 *   - Flag any authoritative locations NOT in our DB as missing.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Authoritative touchless addresses (normalized for matching)
// Each entry: { street, city, state, numKey } — numKey is the street number
// which is the most reliable discriminator.
const AUTHORITATIVE = [
  { street: '374 Tenney Mountain Highway', city: 'Plymouth', state: 'NH', numKey: '374', streetKey: 'tenney' },
  { street: '73 Plaistow Road',             city: 'Haverhill', state: 'MA', numKey: '73', streetKey: 'plaistow' },
  { street: '55 Riverside Street',          city: 'Portland', state: 'ME', numKey: '55', streetKey: 'riverside' },
  { street: '131 Commerce Way',             city: 'Plymouth', state: 'MA', numKey: '131', streetKey: 'commerce' },
  { street: '309 NH-104',                   city: 'New Hampton', state: 'NH', numKey: '309', streetKey: '104' },
  { street: '425 Merrimack Street',         city: 'Lawrence', state: 'MA', numKey: '425', streetKey: 'merrimack' },
  { street: '75 Route 101A',                city: 'Amherst', state: 'NH', numKey: '75', streetKey: '101a' },
];

function addressMatches(listingAddress, listingCity, listingState, auth) {
  if (!listingAddress) return false;
  if (listingState !== auth.state) return false;
  const cityOK = listingCity && listingCity.toLowerCase().includes(auth.city.toLowerCase());
  if (!cityOK) return false;
  const addr = listingAddress.toLowerCase();
  return addr.includes(auth.numKey) && addr.includes(auth.streetKey);
}

// Pull all Haffner's listings
const { data: all } = await sb.from('listings')
  .select('id, name, address, city, state, is_touchless, is_approved, classification_source')
  .ilike('name', '%haffner%');

console.log(`${all.length} Haffner's listings in DB\n`);

const matched = [];
const unmatched = [];
for (const l of all) {
  const auth = AUTHORITATIVE.find(a => addressMatches(l.address, l.city, l.state, a));
  if (auth) matched.push({ ...l, matchedAddress: auth.street });
  else unmatched.push(l);
}

console.log(`MATCHED to authoritative touchless addresses: ${matched.length}`);
for (const l of matched) {
  console.log(`  ✅ ${l.name.slice(0,30).padEnd(30)} ${l.address} / ${l.city}, ${l.state}  t=${l.is_touchless} a=${l.is_approved}`);
}

console.log(`\nUNMATCHED (not in Haffner's touchless list — revert if currently touchless): ${unmatched.length}`);
for (const l of unmatched) {
  console.log(`  ❌ ${l.name.slice(0,30).padEnd(30)} ${l.address || '(no address)'} / ${l.city}, ${l.state}  t=${l.is_touchless} a=${l.is_approved}`);
}

// Missing from DB? (authoritative addresses we don't have listings for)
console.log(`\nAuthoritative locations and DB presence:`);
for (const auth of AUTHORITATIVE) {
  const has = matched.some(m => m.matchedAddress === auth.street);
  console.log(`  ${has ? '✅' : '⚠️ MISSING'}  ${auth.street} / ${auth.city}, ${auth.state}`);
}

// Revert all unmatched Haffner's listings that are currently touchless
const toRevert = unmatched.filter(l => l.is_touchless === true);
if (toRevert.length > 0) {
  console.log(`\nReverting ${toRevert.length} Haffner's listings not in authoritative list...`);
  const ids = toRevert.map(l => l.id);
  const { error } = await sb.from('listings').update({
    is_touchless: false,
    is_approved: false,
    touchless_verified: null,
    classification_source: 'reverted_apr17_haffners_not_in_authoritative_list',
    crawl_notes: `Reverted: Haffner's own website (haffners.com/car-washes/Touchless-Car-Washes) lists exactly 7 touchless locations. This listing's address does NOT match any of those 7. Likely a Haffner's gas station or non-touchless car wash location.`,
  }).in('id', ids);
  if (error) console.error(error);
  else console.log(`Reverted: ${ids.length}`);
}

// Ensure matched listings are properly classified
const toRestore = matched.filter(l => !l.is_touchless || !l.is_approved);
if (toRestore.length > 0) {
  console.log(`\nEnsuring ${toRestore.length} authoritatively-touchless Haffner's are set correctly...`);
  const ids = toRestore.map(l => l.id);
  const { error } = await sb.from('listings').update({
    is_touchless: true,
    touchless_verified: 'chain',
    classification_source: 'verified_apr17_haffners_authoritative_touchless_list',
    crawl_notes: `Verified: This address is on haffners.com's official touchless car wash locations list. Chain-verified touchless.`,
  }).in('id', ids);
  if (error) console.error(error);
  else console.log(`Ensured: ${ids.length}`);
}
