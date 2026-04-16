#!/usr/bin/env node
/**
 * Inspect the listings still held at is_approved=false because they're
 * missing rating/review_count. Identify which have a Google place_id vs.
 * which genuinely don't have Google presence.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data } = await sb.from('listings')
  .select('id, name, city, state, website, google_place_id, rating, review_count, is_approved, classification_source')
  .like('classification_source', 'promoted_apr16%')
  .eq('is_touchless', true)
  .eq('is_approved', false);

console.log(`Total held at is_approved=false: ${data.length}\n`);

const noReviews = data.filter(l => !l.rating || !l.review_count || l.review_count === 0);
const hasPlaceId = noReviews.filter(l => l.google_place_id);
const noPlaceId = noReviews.filter(l => !l.google_place_id);

console.log(`Missing rating/review_count: ${noReviews.length}`);
console.log(`  With google_place_id (can mine via Maps): ${hasPlaceId.length}`);
console.log(`  Without google_place_id (no Google presence): ${noPlaceId.length}`);

console.log(`\nSample with place_id:`);
for (const l of hasPlaceId.slice(0, 5)) {
  console.log(`  ${l.name.slice(0,30).padEnd(30)} ${l.city}, ${l.state}  place_id=${l.google_place_id.slice(0,25)}...`);
}

console.log(`\nSample without place_id:`);
for (const l of noPlaceId.slice(0, 5)) {
  console.log(`  ${l.name.slice(0,30).padEnd(30)} ${l.city}, ${l.state}  website=${l.website || '(none)'}`);
}
