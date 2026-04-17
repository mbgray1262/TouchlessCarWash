#!/usr/bin/env node
/**
 * Flip is_approved=true for held listings that already meet the
 * no-partial-listings bar (hero + hours + amenities + description +
 * rating/review_count).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data } = await sb.from('listings')
  .select('id, name, city, state, hero_image, google_photo_url, street_view_url, hours, amenities, description, rating, review_count, classification_source')
  .eq('is_touchless', true)
  .eq('is_approved', false)
  .or('classification_source.like.promoted_apr16%,classification_source.like.imported_apr16%');

const ready = data.filter(l => {
  const hero = !!(l.hero_image || l.google_photo_url || l.street_view_url);
  const hours = !!(l.hours && Object.keys(l.hours).length > 0);
  const amenities = Array.isArray(l.amenities) && l.amenities.length > 0;
  const description = !!(l.description && l.description.length > 50);
  const reviews = !!(l.rating && l.review_count && l.review_count > 0);
  return hero && hours && amenities && description && reviews;
});

console.log(`${ready.length} listings ready to approve (of ${data.length} held)\n`);

if (ready.length === 0) process.exit(0);

// Show sample
for (const l of ready.slice(0, 10)) {
  console.log(`  ${l.name.slice(0,35).padEnd(35)} ${l.city}, ${l.state}  (${l.rating}★ × ${l.review_count}) [${l.classification_source}]`);
}
if (ready.length > 10) console.log(`  ...and ${ready.length - 10} more`);

const ids = ready.map(l => l.id);
let done = 0;
for (let i = 0; i < ids.length; i += 100) {
  const batch = ids.slice(i, i + 100);
  const { error } = await sb.from('listings').update({ is_approved: true }).in('id', batch);
  if (!error) done += batch.length;
  else console.error(error);
}
console.log(`\n✅ Approved ${done} listings — they're live as of now.`);
