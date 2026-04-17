#!/usr/bin/env node
/**
 * Second sweep — delete listings with Google categories that are clearly
 * NOT a car wash (beyond the B2B sweep that already caught suppliers/hardware).
 *
 * Categories to remove:
 *   - Pressure washing service (pressure wash homes/buildings, not cars)
 *   - Auto repair / body / dent / restoration services
 *   - Window tinting / wrapping services
 *   - Oil change service (some overlap with car wash — we delete only
 *     ones classified specifically as oil-change with NO wash signal)
 *   - Laundromat, Hotel, Restaurant, Bed & Breakfast — wrong business
 *   - Car dealerships (Ford, Chevy, etc.)
 *   - Carpet cleaning, Pet groomer, Self-storage, Gutter cleaning,
 *     House cleaning, Towing, Electrician, Mechanic, Cleaners, Radiator,
 *     Trailer repair, Cleaning products supplier, Wax supplier
 *   - Car detailing service (when currently is_touchless=true — detailers
 *     hand-wash, they touch the car; touchless is specifically automatic)
 *
 * Run with --dry to preview, --execute to delete.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const EXECUTE = process.argv.includes('--execute');

// Always-delete categories (never a consumer touchless car wash)
const ALWAYS_DELETE = new Set([
  'Pressure washing service',
  'Auto repair shop', 'Auto repair and maintenance service', 'Car repair and maintenance service',
  'Auto body shop', 'Auto dent removal service', 'Auto restoration service',
  'Window tinting service', 'Auto window tinting service',
  'Vehicle wrapping service',
  'Laundromat',
  'hotels', 'Hotel', 'Bed & breakfast',
  'Ford dealer', 'Chevrolet dealer', 'Toyota dealer', 'Honda dealer',
  'Carpet cleaning service',
  'Pet groomer',
  'Self-storage facility',
  'Electrician',
  'restaurants', 'Restaurant',
  'Repair service',
  'Cleaners',
  'Wax supplier',
  'Trailer repair shop',
  'Truck repair shop',
  'Cleaning service', 'House cleaning service', 'Gutter cleaning service',
  'Taller de reparación de automóviles',
  'Mechanic',
  'Radiator shop',
  'Towing service',
  'Cleaning products supplier',
  'attractions',
]);

// Delete ONLY if currently is_touchless=true (detailers aren't touchless by definition)
const DELETE_IF_TOUCHLESS = new Set([
  'Car detailing service',
  'Oil change service',  // only if marked touchless without wash evidence
]);

async function loadAll() {
  const all = [];
  for (let offset = 0; offset < 60000; offset += 1000) {
    const { data } = await sb.from('listings')
      .select('id, name, slug, city, state, google_category, google_subtypes, is_touchless, is_approved, website, wash_packages, touchless_wash_types')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

const all = await loadAll();
console.log(`Loaded ${all.length} listings`);

const hardDelete = [];
const conditionalDelete = [];
for (const l of all) {
  const cat = l.google_category;
  const sub = l.google_subtypes;
  if (!cat && !sub) continue;

  if (ALWAYS_DELETE.has(cat) || ALWAYS_DELETE.has(sub)) {
    hardDelete.push(l);
  } else if (DELETE_IF_TOUCHLESS.has(cat) || DELETE_IF_TOUCHLESS.has(sub)) {
    if (l.is_touchless) conditionalDelete.push(l);
  }
}

console.log(`\nClear-cut deletes (wrong business type): ${hardDelete.length}`);
console.log(`Conditional deletes (detailers/oil-change marked touchless): ${conditionalDelete.length}`);

// Preview
console.log(`\nSample hard-deletes:`);
for (const l of hardDelete.slice(0, 15)) {
  console.log(`  ${l.name.slice(0,35).padEnd(35)} ${l.city}, ${l.state}  [${l.google_category}]  t=${l.is_touchless}`);
}

console.log(`\nSample conditional-deletes (touchless=true but category suggests otherwise):`);
for (const l of conditionalDelete.slice(0, 20)) {
  console.log(`  ${l.name.slice(0,35).padEnd(35)} ${l.city}, ${l.state}  [${l.google_category}]`);
}

writeFileSync('scripts/discovery-output/non-carwash-category-audit.json', JSON.stringify({
  timestamp: new Date().toISOString(),
  hard_delete: hardDelete.map(l => ({ id: l.id, name: l.name, city: l.city, state: l.state, category: l.google_category, is_touchless: l.is_touchless })),
  conditional_delete: conditionalDelete.map(l => ({ id: l.id, name: l.name, city: l.city, state: l.state, category: l.google_category })),
}, null, 2));

if (!EXECUTE) {
  console.log(`\n(DRY RUN — re-run with --execute to delete)`);
  process.exit(0);
}

// Only execute HARD deletes (safer — conditional ones need review because
// some legit touchless washes have dual category e.g. "Quick Lube & Laser Wash")
const allIds = hardDelete.map(l => l.id);
let deleted = 0;
for (let i = 0; i < allIds.length; i += 100) {
  const batch = allIds.slice(i, i + 100);
  await sb.from('review_snippets').delete().in('listing_id', batch);
  const { error } = await sb.from('listings').delete().in('id', batch);
  if (!error) deleted += batch.length;
  else console.error(error);
}
console.log(`\n✅ DELETED ${deleted} hard-delete listings (conditional ones skipped for manual review)`);
