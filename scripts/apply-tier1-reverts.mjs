#!/usr/bin/env node
/**
 * Tier 1 reverts: high-confidence NOT_TOUCHLESS audits where the flag clearly
 * indicates the location is NOT a touchless car wash (tunnel chain, non-car-wash
 * business, brush-equipped, soft-cloth, hand wash, detailer-only).
 *
 * Skipped (→ Tier 2 human review):
 *   - no-evidence          (absence isn't proof — held pending enrichment)
 *   - mixed-facility       (memory rule: keep if any touchless signal present)
 *   - self-serve-*         (could be mixed facility with a touchless bay)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const high = JSON.parse(readFileSync('scripts/out/audit-not-touchless-high.json','utf8'));

// Flags that justify a Tier 1 auto-revert
const TIER1_FLAGS = new Set([
  'tunnel-chain',
  'soft-cloth-website', 'soft-cloth-photos', 'soft-cloth-tunnel',
  'soft-cloth-review', 'soft-cloth-reviews', 'soft-cloth-signage',
  'rotating-brush-photos',
  'gas-station-only', 'gas-station-only-photos', 'gas-station-no-wash', 'gas-station-no-wash-visible',
  'convenience-store-only', 'not-a-car-wash', 'wrong-business-photos', 'no-wash-visible',
  'detailer-amenities',
  'hand-wash-photos', 'hand-wash-reviews',
  'misleading-name',
  'customer-review-contradiction', 'customer-reviews-contradict-touchless',
]);

const tier1 = [];
const tier2 = [];
for (const a of high) {
  const flags = Array.isArray(a.flags) ? a.flags : [];
  if (flags.some(f => TIER1_FLAGS.has(f))) tier1.push(a);
  else tier2.push(a);
}

console.log(`Tier 1 (auto-revert): ${tier1.length}`);
console.log(`Tier 2 (human review): ${tier2.length}\n`);

// Group Tier 1 by dominant flag for the report
const byFlag = {};
for (const a of tier1) {
  const flag = (a.flags||[]).find(f => TIER1_FLAGS.has(f)) || '(none)';
  byFlag[flag] = (byFlag[flag]||0)+1;
}
console.log('Tier 1 breakdown by flag:');
Object.entries(byFlag).sort((a,b)=>b[1]-a[1]).forEach(([f,n])=>console.log(`  ${n.toString().padStart(4)} ${f}`));

const DRY = process.argv.includes('--dry-run');
if (DRY) { console.log('\n[DRY RUN] — no DB writes'); process.exit(0); }

console.log(`\nApplying reverts...`);
const today = new Date().toISOString().slice(0,10);
let ok = 0, err = 0;
for (const a of tier1) {
  const flagSummary = (a.flags||[]).filter(f => TIER1_FLAGS.has(f)).join(',');
  const note = `[${today}] Reverted by AI audit (flags: ${flagSummary}). Confidence=${a.confidence}. Reasoning: ${(a.reasoning||'').slice(0,500)}`;
  const { error } = await sb.from('listings').update({
    is_touchless: false,
    is_approved: false,
    touchless_verified: null,
    crawl_notes: note,
  }).eq('id', a.listing_id);
  if (error) { err++; console.error(`${a.listing_id}: ${error.message}`); }
  else ok++;
  if ((ok+err) % 50 === 0) console.log(`  ${ok+err}/${tier1.length}...`);
}

// Write Tier 2 CSV for human review
const csvRows = ['listing_id,confidence,flags,reasoning'];
for (const a of tier2) {
  const flags = (a.flags||[]).join('|');
  const reasoning = (a.reasoning||'').replace(/"/g,'""').replace(/\n/g,' ').slice(0,400);
  csvRows.push(`${a.listing_id},${a.confidence},"${flags}","${reasoning}"`);
}
writeFileSync('scripts/out/tier2-human-review.csv', csvRows.join('\n'));

console.log(`\nReverted: ${ok}`);
console.log(`Errors:   ${err}`);
console.log(`Tier 2 CSV written: scripts/out/tier2-human-review.csv (${tier2.length} rows)`);
