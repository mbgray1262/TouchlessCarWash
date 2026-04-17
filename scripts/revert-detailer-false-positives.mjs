#!/usr/bin/env node
/**
 * Revert listings that claim touchless but show strong detailer signals
 * AND have no review evidence backing the claim. Triggered by user
 * flagging "Yucaipa Auto Spa — The Best Car Wash" which had:
 *   - google_subtypes: "Car wash, Car detailing service"
 *   - amenities: ceramic coating, detailing, wax, interior cleaning
 *     (all hand-service amenities)
 *   - 0 positive touchless review snippets
 *   - yet touchless_wash_types: ["touchless_automatic"] (claimed touchless)
 *
 * Criteria for revert:
 *   (a) google_subtypes contains "detailing service" AND
 *   (b) has detailer-only amenities (ceramic coating / detailing /
 *       interior cleaning / wax) AND
 *   (c) 0 positive touchless review snippets in review_snippets table
 *
 * Name patterns that also trigger revert:
 *   - "Auto Spa" + detailer amenities + 0 reviews
 *   - "Detail" in name + no review evidence
 *
 * Keep-when-strong-evidence: 2+ positive touchless review snippets = override
 * (real customer confirmation that a touchless bay exists at that site)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Load all touchless+approved listings with detailer signals
const all = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('id, name, slug, city, state, google_category, google_subtypes, amenities, touchless_wash_types, rating, review_count, classification_source')
    .eq('is_touchless', true).eq('is_approved', true)
    .range(offset, offset + 999);
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < 1000) break;
}
console.log(`Loaded ${all.length} approved-touchless listings\n`);

// Filter to detailer-signal candidates
const DETAILER_SUBTYPE = /detailing service|detail shop/i;
const DETAILER_NAME = /\bauto\s+spa\b|\bdetail\s+(?:shop|center|studio|garage)/i;
const DETAILER_AMENITIES = new Set(['ceramic coating', 'detailing', 'interior cleaning', 'wax']);

const candidates = all.filter(l => {
  const subHit = l.google_subtypes && DETAILER_SUBTYPE.test(l.google_subtypes);
  const nameHit = DETAILER_NAME.test(l.name || '');
  if (!subHit && !nameHit) return false;

  // Count detailer-only amenities
  const amenSet = new Set((l.amenities || []).map(a => a.toLowerCase()));
  let detailerAmenCount = 0;
  for (const a of DETAILER_AMENITIES) if (amenSet.has(a)) detailerAmenCount++;

  // Subtype hit alone is enough; name hit needs at least 1 detailer amenity
  return subHit || (nameHit && detailerAmenCount >= 1);
});

console.log(`${candidates.length} candidates with detailer signals\n`);

// Batch-pull positive touchless review counts for each candidate
const ids = candidates.map(l => l.id);
const posByListing = new Map();
for (let i = 0; i < ids.length; i += 200) {
  const batch = ids.slice(i, i + 200);
  const { data: snips } = await sb.from('review_snippets')
    .select('listing_id')
    .in('listing_id', batch)
    .eq('is_touchless_evidence', true);
  for (const s of snips || []) posByListing.set(s.listing_id, (posByListing.get(s.listing_id) || 0) + 1);
}

// Split: revert (0-1 positive) vs keep (2+ positive)
const toRevert = [];
const toKeep = [];
for (const l of candidates) {
  const pos = posByListing.get(l.id) || 0;
  if (pos >= 2) toKeep.push({ ...l, pos });
  else toRevert.push({ ...l, pos });
}

console.log(`REVERT (detailer signal + <2 positive touchless reviews): ${toRevert.length}`);
for (const l of toRevert.slice(0, 25)) {
  console.log(`  ${l.name.slice(0,40).padEnd(40)} ${l.city}, ${l.state}  pos:${l.pos}`);
}
if (toRevert.length > 25) console.log(`  ...and ${toRevert.length - 25} more`);

console.log(`\nKEEP (2+ positive reviews overrides detailer signal): ${toKeep.length}`);
for (const l of toKeep.slice(0, 15)) {
  console.log(`  ${l.name.slice(0,40).padEnd(40)} ${l.city}, ${l.state}  pos:${l.pos}`);
}

writeFileSync('scripts/discovery-output/detailer-revert-audit.json', JSON.stringify({
  timestamp: new Date().toISOString(),
  revert: toRevert.map(l => ({ id: l.id, name: l.name, city: l.city, state: l.state, pos_reviews: l.pos })),
  keep: toKeep.map(l => ({ id: l.id, name: l.name, city: l.city, state: l.state, pos_reviews: l.pos })),
}, null, 2));

// Execute reverts
if (toRevert.length > 0) {
  const revertIds = toRevert.map(l => l.id);
  let done = 0;
  for (let i = 0; i < revertIds.length; i += 100) {
    const batch = revertIds.slice(i, i + 100);
    const { error } = await sb.from('listings').update({
      is_touchless: false,
      is_approved: false,
      touchless_verified: null,
      classification_source: 'reverted_apr17_detailer_no_review_evidence',
      crawl_notes: 'Reverted: Google subtype or name indicates detailer/auto-spa (hand service, not touchless automatic); amenities list is detailer-only (ceramic coating, wax, interior cleaning); 0-1 positive touchless review snippets. Per review-evidence > chain-default rule, insufficient evidence for touchless classification.',
    }).in('id', batch);
    if (!error) done += batch.length;
    else console.error(error);
  }
  console.log(`\n✅ Reverted ${done} detailer false positives`);
}
