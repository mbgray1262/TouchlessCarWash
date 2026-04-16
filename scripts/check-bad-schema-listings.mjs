#!/usr/bin/env node
/**
 * Find all touchless listings where rating > 0 but review_count is 0 or null.
 * These would trigger Google structured-data errors if included in any schema.
 * Per the check in /best and /listing pages, we correctly guard, but any
 * listing matching this shape is a data-quality red flag.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data } = await sb.from('listings')
  .select('id, name, city, state, rating, review_count, is_approved, is_touchless')
  .gt('rating', 0)
  .or('review_count.is.null,review_count.eq.0')
  .eq('is_touchless', true);

console.log(`Touchless listings with rating > 0 but review_count is null/0: ${data.length}`);
console.log(`  (These won't cause schema errors thanks to the code guard,`);
console.log(`   but they are data-quality issues that might be worth cleaning up.)\n`);

const approved = data.filter(l => l.is_approved);
console.log(`Of those, is_approved=true (currently live): ${approved.length}\n`);

if (approved.length > 0 && approved.length <= 20) {
  console.log(`Live ones:`);
  for (const l of approved) {
    console.log(`  ${l.name.slice(0,35).padEnd(35)} ${l.city}, ${l.state}  rating=${l.rating} review_count=${l.review_count}`);
  }
}
