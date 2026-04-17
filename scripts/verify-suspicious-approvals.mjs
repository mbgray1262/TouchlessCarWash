#!/usr/bin/env node
/**
 * Verify the 3 suspicious approvals from today's Yelp sweep:
 *   - LUV Car Wash Atlanta GA (was previously reverted as tunnel chain)
 *   - Classy Chassis Express Self-Serve Car Wash Lakewood WA ("Self-Serve" in name)
 *   - ModWash Fort Mill SC (unknown chain classification)
 *
 * For each: check review_snippets count + Google category. If evidence
 * is weak OR the business is clearly self-serve/tunnel by name, revert.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Known-tunnel chain slugs (from blocklist + known info)
const TUNNEL_NAMES = /^(?:LUV Car Wash|Tidal Wave|Whistle Express|Take 5|Tsunami|Mister Car|Quick Quack|Tommy.s Express|Zips|WhiteWater Express|Rocket Wash)\b/i;

// Self-serve signal in name
const SELF_SERVE_NAMES = /\b(?:Self[- ]Serv|Self[- ]Service|Wand Wash)\b/i;

// Fetch all 43 approved-today from Yelp-sweep
const { data: suspects } = await sb.from('listings')
  .select('id, name, city, state, google_category, google_subtypes, amenities, parent_chain, classification_source, rating, review_count')
  .eq('is_touchless', true)
  .eq('is_approved', true)
  .or('classification_source.eq.promoted_apr16_yelp_category_sweep,classification_source.like.promoted_apr16_metro_sweep_%');

console.log(`Checking ${suspects.length} recently-approved listings for obvious red flags...\n`);

const reverts = [];
for (const l of suspects) {
  const flags = [];
  if (TUNNEL_NAMES.test(l.name)) flags.push('tunnel-chain-name');
  if (SELF_SERVE_NAMES.test(l.name)) flags.push('self-serve-name');
  if (l.google_category && /self[\s-]service/i.test(l.google_category)) flags.push('google-says-selfserve');
  if (l.google_subtypes && /self[\s-]service/i.test(l.google_subtypes)) flags.push('subtypes-say-selfserve');
  if (l.parent_chain && TUNNEL_NAMES.test(l.parent_chain)) flags.push('tunnel-parent-chain');

  if (flags.length > 0) {
    // Check review_snippets — if 3+ positive touchless reviews, let it stand
    const { data: snips } = await sb.from('review_snippets')
      .select('id')
      .eq('listing_id', l.id)
      .eq('is_touchless_evidence', true);
    const evidenceCount = snips?.length || 0;

    if (evidenceCount >= 3) {
      console.log(`⚠️  SKIP (strong review evidence, ${evidenceCount} positive): ${l.name} / ${l.city}, ${l.state} — flags: ${flags.join(',')}`);
    } else {
      reverts.push({ ...l, flags, evidenceCount });
      console.log(`❌ REVERT (flags: ${flags.join(',')}, evidence: ${evidenceCount}): ${l.name} / ${l.city}, ${l.state}`);
    }
  }
}

console.log(`\n${reverts.length} listings flagged for revert\n`);

if (reverts.length > 0) {
  const ids = reverts.map(l => l.id);
  const { error } = await sb.from('listings').update({
    is_touchless: false,
    is_approved: false,
    classification_source: 'reverted_apr16_post_approval_audit',
    crawl_notes: 'Reverted post-approval: name/category signals conflict with touchless classification and review evidence count below 3-confirmation threshold.',
  }).in('id', ids);
  if (error) console.error(error);
  else console.log(`Reverted: ${ids.length}`);
}
