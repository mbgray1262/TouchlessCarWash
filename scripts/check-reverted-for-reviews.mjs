#!/usr/bin/env node
/**
 * Check the 249 tunnel-chain reverts from today. If any have 2+ positive
 * touchless review snippets, UN-revert those per the review-evidence >
 * chain-default rule.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Pull the reverted listings
const { data: reverted } = await sb.from('listings')
  .select('id, name, city, state, website, classification_source')
  .in('classification_source', ['reverted_apr16_metro_v1_tunnel_chain', 'reverted_apr16_metro_v2_tunnel_chain']);

console.log(`${reverted.length} tunnel-chain reverts to review\n`);

const ids = reverted.map(l => l.id);

// Batch-pull review snippets
const reviewsByListing = new Map();
for (let i = 0; i < ids.length; i += 100) {
  const batch = ids.slice(i, i + 100);
  const { data: snips } = await sb.from('review_snippets')
    .select('listing_id, review_text, is_touchless_evidence, touchless_keywords, source')
    .in('listing_id', batch)
    .eq('is_touchless_evidence', true);
  for (const s of (snips || [])) {
    if (!reviewsByListing.has(s.listing_id)) reviewsByListing.set(s.listing_id, []);
    reviewsByListing.get(s.listing_id).push(s);
  }
}

// Listings with 2+ positive touchless reviews
const restoreCandidates = reverted.filter(l => {
  const snips = reviewsByListing.get(l.id) || [];
  return snips.length >= 2;
});
const oneReviewOnly = reverted.filter(l => (reviewsByListing.get(l.id) || []).length === 1);

console.log(`Reverted listings with 2+ positive touchless reviews: ${restoreCandidates.length}`);
for (const l of restoreCandidates.slice(0, 30)) {
  const snips = reviewsByListing.get(l.id);
  console.log(`  ${l.name.slice(0,35).padEnd(35)} ${l.city}, ${l.state}  reviews:${snips.length}`);
  for (const s of snips.slice(0, 2)) {
    console.log(`     src=${s.source} "${(s.review_text||'').slice(0, 120)}"`);
  }
}

console.log(`\nReverted listings with exactly 1 positive touchless review: ${oneReviewOnly.length}`);
console.log(`Reverted listings with zero positive touchless reviews: ${reverted.length - restoreCandidates.length - oneReviewOnly.length}`);

if (restoreCandidates.length > 0) {
  console.log(`\nRestoring ${restoreCandidates.length} listings to is_touchless=true (review evidence > chain default)...`);
  const restoreIds = restoreCandidates.map(l => l.id);
  let done = 0;
  for (let i = 0; i < restoreIds.length; i += 200) {
    const batch = restoreIds.slice(i, i + 200);
    const { error } = await sb.from('listings').update({
      is_touchless: true,
      is_approved: false, // still hold until enriched
      touchless_verified: 'user_review',
      classification_source: 'restored_apr16_review_evidence_over_blocklist',
      crawl_notes: 'Restored: 2+ positive touchless review snippets found on this specific location. Per review-evidence > chain-default rule, customer reviews override tunnel-chain blocklist. Held unapproved pending full enrichment.',
    }).in('id', batch);
    if (!error) done += batch.length;
  }
  console.log(`Restored: ${done}`);
}
