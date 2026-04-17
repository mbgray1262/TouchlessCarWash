#!/usr/bin/env node
/**
 * Sweep for B2B / non-carwash listings that shouldn't be in a consumer
 * directory. Examples:
 *   - Kaady Chemical Corporation (chemical supplier)
 *   - Equipment Company (car wash equipment sales)
 *   - Supply Co / Distributors (B2B wholesale)
 *   - Manufacturer / Manufacturing (industrial)
 *
 * Two detection paths:
 *   1. NAME patterns — strong signals (Chemical, Equipment Co, Supply, etc.)
 *   2. Google category — "Equipment supplier", "Chemical supplier",
 *      "Wholesaler", "Manufacturer", "Distributor", "Industrial supplier"
 *
 * For every hit:
 *   - Prints a preview showing name + category + website
 *   - Flags for DELETE (harder reject) vs REVERT (softer, keep row)
 *
 * Run with --dry to preview only, --execute to actually delete/revert.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const EXECUTE = process.argv.includes('--execute');
const mode = EXECUTE ? 'EXECUTE' : 'DRY RUN';

// Strong B2B name signals — always DELETE when matched
const STRONG_NAME_PATTERNS = [
  { re: /\bChemical\s+(?:Corporation|Corp|Company|Co\.?|Inc\.?|LLC|Ltd)\b/i, reason: 'chemical-company' },
  { re: /\bChemicals?\b.*\b(?:Supply|Supplier|Distributor|Manufacturing)\b/i, reason: 'chemicals-supply' },
  { re: /\bEquipment\s+(?:Company|Co\.?|Corp|Corporation|Supply|Supplier|Solutions|Sales)\b/i, reason: 'equipment-company' },
  { re: /\bSupply\s+(?:Company|Co\.?|Corp|Inc\.?|LLC|Ltd)\b/i, reason: 'supply-company' },
  { re: /\bSupplies\s+(?:Inc\.?|LLC|Corp)\b/i, reason: 'supplies-company' },
  { re: /\bManufacturing\b/i, reason: 'manufacturing' },
  { re: /\bDistributors?\s+(?:Inc\.?|LLC|Corp|Co\.?)\b/i, reason: 'distributor' },
  { re: /\bWholesale\b/i, reason: 'wholesale' },
  { re: /\bIndustrial\s+(?:Supply|Supplier|Solutions|Services)\b/i, reason: 'industrial-supply' },
  { re: /\bCarwash\s+(?:Parts|Solutions|Equipment|Systems\s+Inc)\b/i, reason: 'carwash-parts' },
  { re: /\bParts\s+(?:Company|Co\.?|Inc\.?|Depot)\b/i, reason: 'parts-company' },
];

// Google category signals — B2B categories
const B2B_CATEGORIES = /^(?:Equipment supplier|Chemical (?:manufacturer|supplier|company)|Wholesaler|Manufacturer|Industrial equipment supplier|Distributor|Hardware store|Business to business service)$/i;

// Load ALL listings (not just touchless) — we want to catch B2Bs regardless of flag
async function loadAll() {
  const all = [];
  for (let offset = 0; offset < 60000; offset += 1000) {
    const { data } = await sb.from('listings')
      .select('id, name, slug, city, state, google_category, google_subtypes, is_touchless, is_approved, website')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

console.log(`Mode: ${mode}\n`);
console.log('Loading listings...');
const all = await loadAll();
console.log(`  ${all.length} total\n`);

const hits = [];
for (const l of all) {
  const reasons = [];
  for (const { re, reason } of STRONG_NAME_PATTERNS) {
    if (re.test(l.name)) reasons.push(`name:${reason}`);
  }
  if (l.google_category && B2B_CATEGORIES.test(l.google_category)) reasons.push(`gcat:${l.google_category}`);
  if (l.google_subtypes && B2B_CATEGORIES.test(l.google_subtypes)) reasons.push(`gsub:${l.google_subtypes}`);
  if (reasons.length > 0) hits.push({ ...l, reasons });
}

console.log(`Found ${hits.length} B2B / non-carwash candidates:\n`);

// Split: ones currently touchless-approved (must-fix) vs others
const criticalHits = hits.filter(l => l.is_touchless && l.is_approved);
const otherHits = hits.filter(l => !(l.is_touchless && l.is_approved));

console.log(`🚨 ${criticalHits.length} are CURRENTLY touchless+approved (visible to users):`);
for (const l of criticalHits) {
  console.log(`   ${l.name.slice(0,40).padEnd(40)} ${l.city}, ${l.state}  [${l.reasons.join(', ')}]`);
}

console.log(`\n${otherHits.length} others (already not-touchless or unapproved):`);
for (const l of otherHits.slice(0, 20)) {
  console.log(`   ${l.name.slice(0,40).padEnd(40)} ${l.city}, ${l.state}  (t=${l.is_touchless}, a=${l.is_approved})  [${l.reasons.join(', ')}]`);
}
if (otherHits.length > 20) console.log(`   ...and ${otherHits.length - 20} more`);

// Save audit JSON
writeFileSync('scripts/discovery-output/b2b-non-carwash-audit.json', JSON.stringify({
  timestamp: new Date().toISOString(),
  mode,
  total_hits: hits.length,
  critical_touchless_approved: criticalHits.length,
  hits: hits.map(l => ({
    id: l.id, name: l.name, slug: l.slug, city: l.city, state: l.state,
    is_touchless: l.is_touchless, is_approved: l.is_approved,
    website: l.website, google_category: l.google_category,
    reasons: l.reasons,
  })),
}, null, 2));

console.log(`\nAudit saved to scripts/discovery-output/b2b-non-carwash-audit.json`);

if (!EXECUTE) {
  console.log(`\n(DRY RUN — re-run with --execute to DELETE these from the DB)`);
  process.exit(0);
}

// Execute: hard-delete all hits. These aren't car washes — they shouldn't
// occupy DB space or risk being re-promoted by a future pass.
const ids = hits.map(l => l.id);
let deleted = 0;
for (let i = 0; i < ids.length; i += 100) {
  const batch = ids.slice(i, i + 100);
  // Delete dependent review_snippets first to avoid FK violations
  await sb.from('review_snippets').delete().in('listing_id', batch);
  const { error } = await sb.from('listings').delete().in('id', batch);
  if (!error) deleted += batch.length;
  else console.error(error);
}
console.log(`\n✅ DELETED ${deleted} B2B / non-carwash listings`);
