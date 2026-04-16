#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data } = await sb.from('listings')
  .select('id, name, city, state, rating, review_count, is_approved, is_touchless, slug')
  .ilike('name', '%Brandon%')
  .eq('state', 'KY');

for (const l of data) {
  console.log(`${l.name} / ${l.city}, ${l.state}`);
  console.log(`  id: ${l.id}`);
  console.log(`  slug: ${l.slug}`);
  console.log(`  rating: ${JSON.stringify(l.rating)} (type: ${typeof l.rating})`);
  console.log(`  review_count: ${JSON.stringify(l.review_count)} (type: ${typeof l.review_count})`);
  console.log(`  is_approved: ${l.is_approved}  is_touchless: ${l.is_touchless}`);
  console.log(`  CHECK: rating>0 && review_count>0 = ${l.rating > 0 && l.review_count > 0}`);
  console.log('');
}
