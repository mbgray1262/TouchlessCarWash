#!/usr/bin/env node
/**
 * Audit the 229 held listings (is_approved=false, is_touchless=true,
 * promoted today) and categorize by what's missing.
 *
 * Full-5-fields = hero + hours + amenities + description + reviews
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data } = await sb.from('listings')
  .select('id, name, city, state, hero_image, google_photo_url, street_view_url, hours, amenities, description, rating, review_count, website, google_place_id, latitude, longitude, classification_source')
  .eq('is_touchless', true)
  .eq('is_approved', false)
  .or('classification_source.like.promoted_apr16%,classification_source.like.imported_apr16%');

console.log(`Total held listings: ${data.length}\n`);

const check = l => ({
  hero: !!(l.hero_image || l.google_photo_url || l.street_view_url),
  hours: !!(l.hours && Object.keys(l.hours).length > 0),
  amenities: Array.isArray(l.amenities) && l.amenities.length > 0,
  description: !!(l.description && l.description.length > 50),
  reviews: !!(l.rating && l.review_count && l.review_count > 0),
  website: !!l.website,
  place_id: !!l.google_place_id,
  coords: !!(l.latitude && l.longitude),
});

const tally = { hero: 0, hours: 0, amenities: 0, description: 0, reviews: 0, website: 0, place_id: 0, coords: 0, allFive: 0 };
const bySource = new Map();
const readyIds = [];
const missingBySource = {};

for (const l of data) {
  const c = check(l);
  for (const k of Object.keys(c)) if (c[k]) tally[k]++;
  const allFive = c.hero && c.hours && c.amenities && c.description && c.reviews;
  if (allFive) { tally.allFive++; readyIds.push(l.id); }

  const src = l.classification_source;
  if (!bySource.has(src)) bySource.set(src, { total: 0, ready: 0, missing: { hero: 0, hours: 0, amenities: 0, description: 0, reviews: 0, website: 0, place_id: 0, coords: 0 } });
  const s = bySource.get(src);
  s.total++;
  if (allFive) s.ready++;
  for (const k of Object.keys(c)) if (!c[k]) s.missing[k]++;
}

console.log(`Field coverage across all ${data.length} held listings:`);
console.log(`  Hero (any fallback):  ${tally.hero}/${data.length} (${(100*tally.hero/data.length).toFixed(0)}%)`);
console.log(`  Hours:                ${tally.hours}/${data.length} (${(100*tally.hours/data.length).toFixed(0)}%)`);
console.log(`  Amenities:            ${tally.amenities}/${data.length} (${(100*tally.amenities/data.length).toFixed(0)}%)`);
console.log(`  Description:          ${tally.description}/${data.length} (${(100*tally.description/data.length).toFixed(0)}%)`);
console.log(`  Reviews:              ${tally.reviews}/${data.length} (${(100*tally.reviews/data.length).toFixed(0)}%)`);
console.log(`  Website:              ${tally.website}/${data.length}`);
console.log(`  Place ID:             ${tally.place_id}/${data.length}`);
console.log(`  Coords:               ${tally.coords}/${data.length}`);
console.log(`\n  READY TO APPROVE: ${tally.allFive}/${data.length}\n`);

console.log(`By source:`);
for (const [src, s] of [...bySource.entries()].sort((a,b) => b[1].total - a[1].total)) {
  console.log(`\n  ${src} (${s.total} total, ${s.ready} ready):`);
  for (const [k, n] of Object.entries(s.missing)) {
    if (n > 0) console.log(`    missing ${k}: ${n}`);
  }
}
