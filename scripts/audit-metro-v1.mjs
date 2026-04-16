#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data } = await sb.from('listings')
  .select('id, name, city, state, website')
  .eq('classification_source', 'promoted_apr16_metro_sweep_v1');

const byDomain = new Map();
for (const l of data) {
  if (!l.website) continue;
  let d = null;
  try { d = new URL(l.website).hostname.replace(/^www\./, '').toLowerCase(); } catch {}
  if (!d) continue;
  if (!byDomain.has(d)) byDomain.set(d, []);
  byDomain.get(d).push(l);
}
console.log(`v1 total: ${data.length}`);
console.log(`\nTop domains:`);
for (const [d, lst] of [...byDomain.entries()].sort((a,b)=>b[1].length-a[1].length).slice(0, 30)) {
  console.log(`  ${d.padEnd(45)} ${lst.length}`);
}
