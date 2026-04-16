#!/usr/bin/env node
/**
 * Audit enrichment coverage for today's promotions.
 * Per no-partial-listings rule, each must have: hero, hours, amenities,
 * description, rating/review_count.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data } = await sb.from('listings')
  .select('id, name, city, state, hero_image, google_photo_url, street_view_url, hours, amenities, description, rating, review_count, is_approved, classification_source, website')
  .like('classification_source', 'promoted_apr16%')
  .eq('is_touchless', true);

console.log(`Today's promoted touchless listings: ${data.length}`);

const has = l => ({
  hero: !!(l.hero_image || l.google_photo_url || l.street_view_url),
  hours: !!(l.hours && Object.keys(l.hours).length > 0),
  amenities: Array.isArray(l.amenities) && l.amenities.length > 0,
  description: !!(l.description && l.description.length > 50),
  reviews: !!(l.rating && l.review_count && l.review_count > 0),
  website: !!l.website,
});

const tally = { hero: 0, hours: 0, amenities: 0, description: 0, reviews: 0, website: 0, allFive: 0 };
const bySource = new Map();
for (const l of data) {
  const h = has(l);
  if (h.hero) tally.hero++;
  if (h.hours) tally.hours++;
  if (h.amenities) tally.amenities++;
  if (h.description) tally.description++;
  if (h.reviews) tally.reviews++;
  if (h.website) tally.website++;
  const allFive = h.hero && h.hours && h.amenities && h.description && h.reviews;
  if (allFive) tally.allFive++;
  const src = l.classification_source;
  if (!bySource.has(src)) bySource.set(src, { total: 0, approved: 0, allFive: 0 });
  const s = bySource.get(src);
  s.total++;
  if (l.is_approved) s.approved++;
  if (allFive) s.allFive++;
}

console.log(`\nField coverage:`);
console.log(`  Hero (any fallback):  ${tally.hero}/${data.length} (${(100*tally.hero/data.length).toFixed(0)}%)`);
console.log(`  Hours:                ${tally.hours}/${data.length} (${(100*tally.hours/data.length).toFixed(0)}%)`);
console.log(`  Amenities:            ${tally.amenities}/${data.length} (${(100*tally.amenities/data.length).toFixed(0)}%)`);
console.log(`  Description:          ${tally.description}/${data.length} (${(100*tally.description/data.length).toFixed(0)}%)`);
console.log(`  Reviews (rating+ct):  ${tally.reviews}/${data.length} (${(100*tally.reviews/data.length).toFixed(0)}%)`);
console.log(`  Website:              ${tally.website}/${data.length}`);
console.log(`\n  All 5 fields complete: ${tally.allFive}/${data.length} (${(100*tally.allFive/data.length).toFixed(0)}%)`);

console.log(`\nBy promotion source:`);
for (const [src, s] of [...bySource.entries()].sort((a,b)=>b[1].total-a[1].total)) {
  console.log(`  ${src.padEnd(40)} total:${String(s.total).padStart(3)}  approved:${String(s.approved).padStart(3)}  enriched:${String(s.allFive).padStart(3)}`);
}
