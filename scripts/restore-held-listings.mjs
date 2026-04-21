#!/usr/bin/env node
/**
 * Restore listings that got auto-unapproved by the resolve-held cron but
 * actually already have all the data elements needed to be public:
 *   - hero_image
 *   - description
 *   - hours (non-empty)
 *
 * Leaves any genuinely incomplete listing in the unapproved queue.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env = readFileSync(resolve(repoRoot,'.env.local'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const PAGE = 1000;
const candidates = [];
let offset = 0;
while (true) {
  const { data } = await sb.from('listings')
    .select('id, name, city, state, hero_image, hero_image_source, description, hours, rating, review_count')
    .eq('is_touchless', true).eq('is_approved', false)
    .range(offset, offset + PAGE - 1);
  if (!data || data.length === 0) break;
  candidates.push(...data);
  if (data.length < PAGE) break;
  offset += PAGE;
}
console.log(`Total unapproved is_touchless listings: ${candidates.length}`);

// Quality gate — same as auto-hero-pipeline's "complete" check
const eligible = [];
const reasons = { noHero: 0, noDesc: 0, noHours: 0, heldForReview: 0, ok: 0 };
for (const l of candidates) {
  if (l.hero_image_source === 'held_for_review') { reasons.heldForReview++; continue; }
  const hasHero = !!l.hero_image;
  const hasDesc = !!l.description && l.description.length >= 40;
  const hasHours = l.hours && Object.keys(l.hours).length > 0;
  if (!hasHero) { reasons.noHero++; continue; }
  if (!hasDesc) { reasons.noDesc++; continue; }
  if (!hasHours) { reasons.noHours++; continue; }
  eligible.push(l);
  reasons.ok++;
}
console.log('\nBreakdown:');
console.log(`  Eligible (complete listings to restore): ${reasons.ok}`);
console.log(`  Skipped — held_for_review:               ${reasons.heldForReview}`);
console.log(`  Skipped — no hero_image:                 ${reasons.noHero}`);
console.log(`  Skipped — no description:                ${reasons.noDesc}`);
console.log(`  Skipped — no hours:                      ${reasons.noHours}`);

if (process.argv.includes('--dry-run')) {
  console.log('\nDRY RUN — no updates performed.');
  process.exit(0);
}

console.log('\nRestoring...');
let ok = 0, fail = 0;
for (let i = 0; i < eligible.length; i += 50) {
  const chunk = eligible.slice(i, i + 50);
  const ids = chunk.map(l => l.id);
  const { error } = await sb.from('listings').update({ is_approved: true }).in('id', ids);
  if (error) { fail += chunk.length; console.log(`  chunk ${i}-${i+chunk.length}: ERR ${error.message}`); }
  else { ok += chunk.length; if (i % 200 === 0) console.log(`  restored ${ok}/${eligible.length}`); }
}
console.log(`\nDONE: restored ${ok}, failed ${fail}`);
