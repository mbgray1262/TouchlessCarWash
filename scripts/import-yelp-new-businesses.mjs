#!/usr/bin/env node
/**
 * Import the 123 new-business candidates discovered via Yelp category
 * sweep. These are touchless car washes NOT already in our DB.
 *
 * Insertion strategy:
 *  - is_touchless=true (Yelp reviews confirmed)
 *  - is_approved=false (no-partial-listings rule — must enrich first)
 *  - touchless_verified='user_review'
 *  - classification_source='imported_apr16_yelp_new_business'
 *  - minimal seed data: name, address, city, state, yelp_url as website
 *    (will be replaced by actual website once Crawl4AI finds it)
 *
 * Dedup: skip any where name+city+state already exists in DB (by normalized
 * name match) to avoid creating duplicates.
 *
 * Next step (separate script): run Crawl4AI against each new record to
 * populate google_place_id, lat/lng, phone, website, hours, amenities, hero.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const audit = JSON.parse(readFileSync('scripts/discovery-output/yelp-category-sweep.json','utf8'));
const cands = audit.new_business_candidates || [];
console.log(`${cands.length} new-business candidates from Yelp sweep`);

// Tunnel-chain extra check on biz slug (belt and suspenders)
const TUNNEL_RE = /tidal-wave|whistle-express|take-5|take5|tsunami-express|mister-car|quick-quack|tommy-s-express|tommys-express|zips-car|white-water-express|whitewater-express|rocket-wash|american-pride-xpress|my-express-car|quick-n-clean/i;

// Normalize name for matching
function normName(s) {
  return (s || '').toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function normCity(s) {
  return (s || '').toLowerCase().trim();
}

// Load existing listings to dedupe
console.log('Loading DB for dedup check...');
const dbByStateNameCity = new Set();
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings').select('name, city, state').range(offset, offset + 999);
  if (!data || data.length === 0) break;
  for (const l of data) {
    const key = `${l.state}|${normName(l.name)}|${normCity(l.city)}`;
    dbByStateNameCity.add(key);
  }
  if (data.length < 1000) break;
}
console.log(`  ${dbByStateNameCity.size} existing name+city+state keys`);

// Filter
const toInsert = [];
const skipped = { tunnel: 0, dupe: 0, missing_name: 0, missing_addr: 0 };
for (const c of cands) {
  const name = (c.name || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
  if (!name) { skipped.missing_name++; continue; }
  if (TUNNEL_RE.test(c.yelp_url || '')) { skipped.tunnel++; continue; }
  if (!c.city || !c.state) { skipped.missing_addr++; continue; }
  const key = `${c.state.toUpperCase()}|${normName(name)}|${normCity(c.city)}`;
  if (dbByStateNameCity.has(key)) { skipped.dupe++; continue; }
  dbByStateNameCity.add(key);  // prevent intra-batch dupes too
  toInsert.push({ ...c, name });
}

console.log(`\nFilter results:`);
console.log(`  Would insert: ${toInsert.length}`);
console.log(`  Skipped (tunnel): ${skipped.tunnel}`);
console.log(`  Skipped (dupe of existing DB listing): ${skipped.dupe}`);
console.log(`  Skipped (missing name): ${skipped.missing_name}`);
console.log(`  Skipped (missing city/state): ${skipped.missing_addr}`);

if (toInsert.length === 0) {
  console.log('Nothing to insert. Exiting.');
  process.exit(0);
}

// Show sample
console.log(`\nSample of first 10:`);
for (const c of toInsert.slice(0, 10)) {
  console.log(`  [${c.positive_count}] ${c.name.slice(0,38).padEnd(38)} ${c.city}, ${c.state}`);
}

// Slug helper — matches app/state/[state]/[city]/[slug] conventions
function slugify(s) {
  return (s || '').toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Try to extract zip from address (common US formats: "123 Main St, City ST 12345" or just "12345")
function extractZip(addr) {
  if (!addr) return null;
  const m = addr.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

// Build insert rows
const rows = toInsert.map(c => {
  const slugBase = `${slugify(c.name)}-${slugify(c.city)}-${c.state.toLowerCase()}`;
  // Append a short hash of the Yelp URL to ensure uniqueness
  const hash = Math.abs([...c.yelp_url].reduce((a,x) => a*31 + x.charCodeAt(0) | 0, 0)).toString(36).slice(0, 5);
  const zip = extractZip(c.address) || '00000';  // placeholder — enrichment will correct
  return {
    name: c.name,
    address: c.address || '',
    city: c.city,
    state: c.state.toUpperCase(),
    zip,
    slug: `${slugBase}-${hash}`.slice(0, 100),
    is_touchless: true,
    is_approved: false,
    touchless_verified: 'user_review',
    classification_source: 'imported_apr16_yelp_new_business',
    crawl_notes: `Imported: Yelp biz page had ${c.positive_count} positive touchless review(s). Needs enrichment (place_id, lat/lng, website, phone, hours, hero, zip) before is_approved=true. Source Yelp URL: ${c.yelp_url}`,
    // Stash the Yelp URL in website field as temporary landing (Crawl4AI
    // enrichment will replace with the real business website)
    website: c.yelp_url,
  };
});

// Insert in batches
let inserted = 0;
const insertedIds = [];
for (let i = 0; i < rows.length; i += 50) {
  const batch = rows.slice(i, i + 50);
  const { data, error } = await sb.from('listings').insert(batch).select('id');
  if (error) {
    console.error(`Batch ${i}-${i+batch.length} error: ${error.message}`);
    continue;
  }
  inserted += data.length;
  for (const r of data) insertedIds.push(r.id);
}
console.log(`\nInserted: ${inserted} new listings (all is_approved=false pending enrichment)`);

// Also persist the review snippets to the new listing IDs
console.log('\nSaving review snippets to new listings...');
let snipsSaved = 0;
for (let i = 0; i < insertedIds.length && i < toInsert.length; i++) {
  const id = insertedIds[i];
  const cand = toInsert[i];
  if (!cand.sample) continue;
  try {
    const { error } = await sb.from('review_snippets').insert({
      listing_id: id,
      review_text: cand.sample,
      is_touchless_evidence: true,
      touchless_keywords: ['touchless'],
      source: 'yelp_category_sweep_new',
    });
    if (!error) snipsSaved++;
  } catch {}
}
console.log(`Review snippets saved: ${snipsSaved}`);
console.log(`\nNext: run Crawl4AI to enrich these new listings (place_id, lat/lng, website, hours, hero)`);
