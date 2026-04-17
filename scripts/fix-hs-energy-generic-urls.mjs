#!/usr/bin/env node
/**
 * Fix H&S Energy listings (Power Market / Extra Mile / Pinnacle 365)
 * that have their website pointing to the generic parent-company site
 * (hnsenergygroup.com / hnsenergyproducts.com) instead of a location-
 * specific page. The parent site doesn't have per-location pages, so
 * the link is useless to users — better to show nothing than a useless
 * link. Users can still click "Directions" to reach the location.
 *
 * Action: NULL the website field for these listings.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Match both hnsenergygroup.com and hnsenergyproducts.com (the user saw
// one, the audit script found another)
const GENERIC_URL_RE = /hnsenergy(?:group|products)\.com/i;

const all = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('id, name, city, state, website')
    .like('website', '%hnsenergy%')
    .range(offset, offset + 999);
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < 1000) break;
}
const bad = all.filter(l => GENERIC_URL_RE.test(l.website || ''));

console.log(`${bad.length} listings with generic H&S Energy URL\n`);
for (const l of bad.slice(0, 10)) {
  console.log(`  ${l.name.slice(0,30).padEnd(30)} ${l.city}, ${l.state}  — ${l.website}`);
}
if (bad.length > 10) console.log(`  ...and ${bad.length - 10} more`);

const ids = bad.map(l => l.id);
let done = 0;
for (let i = 0; i < ids.length; i += 100) {
  const batch = ids.slice(i, i + 100);
  const { error } = await sb.from('listings').update({
    website: null,
    crawl_notes: 'Website cleared: was pointing at H&S Energy parent-company site (hnsenergygroup.com) which has no per-location pages. Users can use Directions to reach the actual location.',
  }).in('id', batch);
  if (!error) done += batch.length;
  else console.error(error);
}
console.log(`\n✅ Cleared website field on ${done} H&S Energy listings`);
