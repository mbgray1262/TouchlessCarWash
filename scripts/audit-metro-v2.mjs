#!/usr/bin/env node
/**
 * Audit metro-sweep v2 promotions. Break down by domain to see what
 * drove the big numbers. Flag any domain with 10+ promotions for manual
 * verification.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data } = await sb.from('listings')
  .select('id, name, city, state, website, parent_chain')
  .eq('classification_source', 'promoted_apr16_metro_sweep_v2');

console.log(`${data.length} listings promoted by v2`);

// Group by domain
const byDomain = new Map();
for (const l of data) {
  if (!l.website) continue;
  let d = null;
  try { d = new URL(l.website).hostname.replace(/^www\./, '').toLowerCase(); } catch {}
  if (!d) continue;
  if (!byDomain.has(d)) byDomain.set(d, []);
  byDomain.get(d).push(l);
}

const sorted = [...byDomain.entries()].sort((a,b) => b[1].length - a[1].length);
console.log(`\nTop domains driving promotions:`);
for (const [d, lst] of sorted.slice(0, 20)) {
  console.log(`  ${d.padEnd(45)} ${lst.length}`);
  if (lst.length >= 10) {
    for (const l of lst.slice(0, 3)) console.log(`     e.g. ${l.name} / ${l.city}, ${l.state}`);
  }
}
