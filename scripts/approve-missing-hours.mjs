#!/usr/bin/env node
/**
 * Approve unapproved touchless listings that are complete except for missing
 * hours. Per Michael (2026-04-21): "listings with only hours missing can also
 * be approved" — unattended 24/7 locations commonly have no Google hours.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env = readFileSync(resolve(repoRoot,'.env.local'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const DRY = process.argv.includes('--dry-run');

const PAGE = 1000;
const all = [];
let offset = 0;
while (true) {
  const { data } = await sb.from('listings')
    .select('id, name, city, state, hero_image, hero_image_source, description, hours, amenities, rating, review_count, classification_source')
    .eq('is_touchless', true).eq('is_approved', false)
    .range(offset, offset + PAGE - 1);
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < PAGE) break;
  offset += PAGE;
}

const ready = [];
const skipped = { noHero: 0, noDesc: 0, noAmen: 0, noReviews: 0, heldForReview: 0, closed: 0, hasHours: 0 };
for (const l of all) {
  const src = l.classification_source || '';
  if (src.startsWith('closed_')) { skipped.closed++; continue; }
  if (l.hero_image_source === 'held_for_review') { skipped.heldForReview++; continue; }
  if (!l.hero_image) { skipped.noHero++; continue; }
  if (!l.description || l.description.length < 40) { skipped.noDesc++; continue; }
  if (l.hours && Object.keys(l.hours).length > 0) { skipped.hasHours++; continue; }
  const hasAmen = Array.isArray(l.amenities) && l.amenities.length > 0;
  const hasReviews = l.rating != null && l.review_count != null && l.review_count > 0;
  if (!hasAmen) { skipped.noAmen++; continue; }
  if (!hasReviews) { skipped.noReviews++; continue; }
  ready.push(l);
}

console.log(`Total unapproved touchless: ${all.length}`);
console.log(`Ready to approve (hero+desc+amenities+reviews, only missing hours): ${ready.length}`);
console.log('\nSkipped reasons:');
for (const [k,v] of Object.entries(skipped)) console.log(`  ${k.padEnd(20)} ${v}`);

if (ready.length === 0) process.exit(0);

console.log('\nSample of 10:');
for (const l of ready.slice(0,10)) {
  console.log(`  ${l.name.slice(0,35).padEnd(35)} ${l.city}, ${l.state}  ${l.rating}★×${l.review_count}  amen=${l.amenities?.length||0}  desc=${l.description.length}`);
}

if (DRY) { console.log('\nDRY RUN — no writes'); process.exit(0); }

const ids = ready.map(l => l.id);
let done = 0;
for (let i = 0; i < ids.length; i += 100) {
  const batch = ids.slice(i, i + 100);
  const { error } = await sb.from('listings').update({ is_approved: true }).in('id', batch);
  if (error) { console.error(`  chunk ${i}: ${error.message}`); break; }
  done += batch.length;
}
console.log(`\n✅ Approved ${done} listings.`);
