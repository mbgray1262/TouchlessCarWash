#!/usr/bin/env node
/**
 * Revert Splash Car Wash listings with weak touchless evidence.
 *
 * Michael flagged Splash Shelton CT after reading a customer review that
 * explicitly said "Isn't even a touch less car wash" and "machines that
 * spin to wash your car left scratches all over my car". This confirms
 * Splash Car Wash is a regional TUNNEL chain (CT/NY), not touchless.
 *
 * Per review-evidence > chain-default rule:
 *   - Locations with ZERO or 1 positive touchless review snippet → revert
 *     (the Apr 15 "mixed_with_touchless_bay" restore was too permissive)
 *   - Locations with 2+ positive touchless review snippets → KEEP
 *     (real customers confirmed a touchless bay exists at that specific
 *     location; those listings get touchless_verified='user_review')
 *
 * Also: save Michael's Shelton review as a review_snippets row with
 * is_touchless_evidence=false so future promotion passes skip it.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// 1. Save Shelton's contradicting review
const SHELTON_REVIEW = `Awful splash location. Isn't even a touch less car wash. No people drying your car afterwards so my car is in my garage with soap and suds still wet. Plus the machines that spin to wash your car left scratches all over my car. Pathetic.`;
const sheltonId = '8595ed2b-079c-4984-b42c-519847753336';
const { error: snipErr } = await sb.from('review_snippets').upsert({
  listing_id: sheltonId,
  review_text: SHELTON_REVIEW,
  is_touchless_evidence: false,
  sentiment: 'negative',
  touchless_keywords: ['touch less', 'spin'],
  source: 'user_flagged_apr17',
}, { onConflict: 'listing_id,source' });
if (snipErr) console.log(`Shelton snippet save: ${snipErr.message}`);
else console.log('Saved Shelton negative-evidence review snippet');

// 2. Pull all Splash Car Wash (parent_chain) listings
const { data: splashListings } = await sb.from('listings')
  .select('id, name, city, state, is_touchless, is_approved, classification_source')
  .eq('parent_chain', 'Splash Car Wash')
  .eq('is_touchless', true);

console.log(`\n${splashListings.length} Splash Car Wash touchless listings\n`);

// 3. Count positive touchless evidence per listing
const ids = splashListings.map(l => l.id);
const { data: snips } = await sb.from('review_snippets')
  .select('listing_id, is_touchless_evidence')
  .in('listing_id', ids)
  .eq('is_touchless_evidence', true);

const posByListing = new Map();
for (const s of snips || []) posByListing.set(s.listing_id, (posByListing.get(s.listing_id) || 0) + 1);

// 4. Determine reverts vs keeps
const toRevert = [];
const toKeep = [];
for (const l of splashListings) {
  const posCount = posByListing.get(l.id) || 0;
  if (posCount >= 2) toKeep.push({ ...l, posCount });
  else toRevert.push({ ...l, posCount });
}

console.log(`KEEPING (2+ positive reviews — real customer confirmation):`);
for (const l of toKeep) console.log(`  ${l.name.slice(0,30).padEnd(30)} ${l.city}, ${l.state}  pos:${l.posCount}`);

console.log(`\nREVERTING (<2 positive reviews — weak evidence):`);
for (const l of toRevert) console.log(`  ${l.name.slice(0,30).padEnd(30)} ${l.city}, ${l.state}  pos:${l.posCount}`);

// 5. Apply reverts
if (toRevert.length > 0) {
  const revertIds = toRevert.map(l => l.id);
  let done = 0;
  for (let i = 0; i < revertIds.length; i += 100) {
    const batch = revertIds.slice(i, i + 100);
    const { error } = await sb.from('listings').update({
      is_touchless: false,
      is_approved: false,
      touchless_verified: null,
      classification_source: 'reverted_apr17_splash_tunnel_chain_weak_evidence',
      crawl_notes: `Reverted: Splash Car Wash is a regional tunnel chain (CT/NY); user flagged Shelton CT after reading customer review "Isn't even a touch less car wash" + "machines that spin" (friction tunnel signal). Locations with <2 positive touchless review snippets reverted per review-evidence > chain-default rule. Locations with 2+ positive reviews were kept (real customer evidence of a touchless bay at that specific site).`,
    }).in('id', batch);
    if (!error) done += batch.length;
    else console.error(error);
  }
  console.log(`\n✅ Reverted: ${done}`);
  console.log(`✅ Kept with strong review evidence: ${toKeep.length}`);
}
