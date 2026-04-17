#!/usr/bin/env node
/**
 * Sweep for truck-wash listings that shouldn't be in a consumer car wash
 * directory. User flagged "Big Boys Truck Wash" in Rolla MO.
 *
 * Detection signals:
 *   - Google category contains "Truck" (except if also "Car wash")
 *   - Name contains "truck wash" (distinct from "truck stop" — truck stops
 *     often have car wash facilities)
 *   - Name contains specific truck-wash patterns
 *
 * Action: DELETE (not just revert) — truck washes are never our audience.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const EXECUTE = process.argv.includes('--execute');

// Strict name patterns — "truck wash" / "semi wash" / "18-wheeler" etc.
const TRUCK_WASH_NAME = /\b(?:truck\s+wash|big\s+truck|semi[-\s]wash|18[-\s]wheeler\s+wash|fleet\s+wash|big\s+rig\s+wash|trailer\s+wash|commercial\s+truck\s+wash)\b/i;

// Google category patterns (but exclude "Truck stop" — those often have car wash)
const TRUCK_CATEGORIES = /^(?:Truck\s+wash|Truck\s+washing|Truck\s+repair\s+shop|Trucking\s+company|Commercial\s+vehicle\s+washing\s+service)$/i;

const all = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('id, name, slug, city, state, google_category, google_subtypes, website, is_touchless, is_approved')
    .range(offset, offset + 999);
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < 1000) break;
}
console.log(`Loaded ${all.length} listings`);

const hits = [];
for (const l of all) {
  const reasons = [];
  if (TRUCK_WASH_NAME.test(l.name || '')) reasons.push(`name:truck-wash`);
  if (l.google_category && TRUCK_CATEGORIES.test(l.google_category)) reasons.push(`gcat:${l.google_category}`);
  if (l.google_subtypes && TRUCK_CATEGORIES.test(l.google_subtypes)) reasons.push(`gsub:${l.google_subtypes}`);
  if (reasons.length > 0) hits.push({ ...l, reasons });
}

console.log(`\nFound ${hits.length} truck-wash candidates:\n`);
const criticalHits = hits.filter(l => l.is_touchless && l.is_approved);
console.log(`🚨 ${criticalHits.length} currently visible as touchless:`);
for (const l of criticalHits) {
  console.log(`   ${l.name.slice(0,40).padEnd(40)} ${l.city}, ${l.state}  [${l.reasons.join(', ')}]`);
}
console.log(`\nOthers (unapproved or not-touchless):`);
for (const l of hits.filter(l => !(l.is_touchless && l.is_approved)).slice(0, 20)) {
  console.log(`   ${l.name.slice(0,40).padEnd(40)} ${l.city}, ${l.state}  (t=${l.is_touchless}, a=${l.is_approved})  [${l.reasons.join(', ')}]`);
}
const nonCritical = hits.filter(l => !(l.is_touchless && l.is_approved));
if (nonCritical.length > 20) console.log(`   ...and ${nonCritical.length - 20} more`);

writeFileSync('scripts/discovery-output/truck-wash-audit.json', JSON.stringify({
  timestamp: new Date().toISOString(),
  hits: hits.map(l => ({ id: l.id, name: l.name, city: l.city, state: l.state, is_touchless: l.is_touchless, is_approved: l.is_approved, reasons: l.reasons })),
}, null, 2));

if (!EXECUTE) {
  console.log(`\n(DRY RUN — re-run with --execute to delete)`);
  process.exit(0);
}

const ids = hits.map(l => l.id);
let deleted = 0;
for (let i = 0; i < ids.length; i += 100) {
  const batch = ids.slice(i, i + 100);
  await sb.from('review_snippets').delete().in('listing_id', batch);
  const { error } = await sb.from('listings').delete().in('id', batch);
  if (!error) deleted += batch.length;
  else console.error(error);
}
console.log(`\n✅ DELETED ${deleted} truck washes`);
