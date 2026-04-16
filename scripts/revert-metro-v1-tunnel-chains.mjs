#!/usr/bin/env node
/**
 * Revert v1 metro sweep false positives. Same domains as v2 + a few
 * additional obvious tunnel chains that showed up in v1.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const TUNNEL_OR_BAD_DOMAINS = [
  'whistleexpresscarwash.com',
  'tidalwaveautospa.com',
  'way.com',                     // aggregator
  'americanpridexpress.com',     // Xpress
  'myexpresscarwash.com',        // Xpress
  'xpressolube.com',             // not a car wash, lube
  'quicknclean.net',             // typically express/tunnel
];

const { data } = await sb.from('listings')
  .select('id, name, city, state, website, classification_source')
  .eq('classification_source', 'promoted_apr16_metro_sweep_v1');

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

const toRevert = data.filter(l => {
  const d = extractDomain(l.website);
  return d && TUNNEL_OR_BAD_DOMAINS.includes(d);
});

console.log(`Reverting ${toRevert.length} v1 false positives:`);
const byDomain = new Map();
for (const l of toRevert) {
  const d = extractDomain(l.website);
  byDomain.set(d, (byDomain.get(d) || 0) + 1);
}
for (const [d, c] of byDomain) console.log(`  ${d}: ${c}`);

if (toRevert.length > 0) {
  const ids = toRevert.map(l => l.id);
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const { error } = await sb.from('listings').update({
      is_touchless: false,
      is_approved: false,
      touchless_verified: null,
      classification_source: 'reverted_apr16_metro_v1_tunnel_chain',
      crawl_notes: 'Reverted: metro-sweep v1 incorrectly promoted tunnel-chain location. Snippet likely mentioned "touchless" in comparison context.',
    }).in('id', batch);
    if (!error) done += batch.length;
  }
  console.log(`Reverted: ${done}`);
}

const { count } = await sb.from('listings').select('*',{count:'exact',head:true}).eq('classification_source','promoted_apr16_metro_sweep_v1');
console.log(`\nv1 promotions still standing: ${count}`);
