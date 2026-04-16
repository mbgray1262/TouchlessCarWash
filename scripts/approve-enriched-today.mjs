#!/usr/bin/env node
/**
 * Flip is_approved=true for today's promotions that now have all 5
 * required fields (hero image, hours, amenities, description, reviews).
 * Per no-partial-listings rule.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data } = await sb.from('listings')
  .select('id, name, city, state, hero_image, google_photo_url, street_view_url, hours, amenities, description, rating, review_count, is_approved, classification_source')
  .like('classification_source', 'promoted_apr16%')
  .eq('is_touchless', true)
  .eq('is_approved', false);

console.log(`${data.length} unapproved today's promotions to check\n`);

const isEnriched = l => {
  const hero = !!(l.hero_image || l.google_photo_url || l.street_view_url);
  const hours = !!(l.hours && Object.keys(l.hours).length > 0);
  const amenities = Array.isArray(l.amenities) && l.amenities.length > 0;
  const description = !!(l.description && l.description.length > 50);
  const reviews = !!(l.rating && l.review_count && l.review_count > 0);
  return hero && hours && amenities && description && reviews;
};

const ready = data.filter(isEnriched);
const notReady = data.filter(l => !isEnriched(l));

console.log(`Ready to approve (all 5 fields): ${ready.length}`);
console.log(`Still missing one or more fields: ${notReady.length}`);

// Group "not ready" by what's missing
const missingCounts = { hero: 0, hours: 0, amenities: 0, description: 0, reviews: 0 };
for (const l of notReady) {
  if (!(l.hero_image || l.google_photo_url || l.street_view_url)) missingCounts.hero++;
  if (!(l.hours && Object.keys(l.hours).length > 0)) missingCounts.hours++;
  if (!(Array.isArray(l.amenities) && l.amenities.length > 0)) missingCounts.amenities++;
  if (!(l.description && l.description.length > 50)) missingCounts.description++;
  if (!(l.rating && l.review_count && l.review_count > 0)) missingCounts.reviews++;
}
console.log(`\nWhat's missing in "not ready":`);
for (const [f, n] of Object.entries(missingCounts)) console.log(`  ${f}: ${n}`);

if (ready.length > 0) {
  const ids = ready.map(l => l.id);
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const { error } = await sb.from('listings').update({ is_approved: true }).in('id', batch);
    if (!error) done += batch.length;
  }
  console.log(`\nApproved: ${done}`);
}
