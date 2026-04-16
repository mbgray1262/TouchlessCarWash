#!/usr/bin/env node
/**
 * Revert v2 metro sweep false positives: Whistle Express and Tidal Wave
 * are tunnel chains, not touchless. Search results mentioned "touchless"
 * because reviewers compared them to touchless options, not because they
 * ARE touchless. Also revert way.com (aggregator, not a business) and
 * any other suspicious high-volume chains.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Chains that are TUNNEL/CONVEYOR, not touchless. Never promote.
const TUNNEL_CHAIN_DOMAINS = [
  'whistleexpresscarwash.com',  // Express tunnel chain
  'tidalwaveautospa.com',       // Tunnel
  'way.com',                    // Aggregator, not a real business domain
  'americanpridexpress.com',    // "Xpress" = tunnel
];

// Pull everything promoted by v2
const { data } = await sb.from('listings')
  .select('id, name, city, state, website, classification_source')
  .eq('classification_source', 'promoted_apr16_metro_sweep_v2');

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

const toRevert = data.filter(l => {
  const d = extractDomain(l.website);
  return d && TUNNEL_CHAIN_DOMAINS.includes(d);
});

console.log(`Reverting ${toRevert.length} false positives from tunnel chains:`);
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
      classification_source: 'reverted_apr16_metro_v2_tunnel_chain',
      crawl_notes: 'Reverted: incorrectly promoted by metro-sweep v2. Whistle Express / Tidal Wave / etc. are tunnel-conveyor chains, not touchless. Snippet likely mentioned "touchless" in a comparison context.',
    }).in('id', batch);
    if (!error) done += batch.length;
  }
  console.log(`Reverted: ${done}`);
}

// Count remaining v2 promotions
const { count } = await sb.from('listings').select('*',{count:'exact',head:true}).eq('classification_source','promoted_apr16_metro_sweep_v2');
console.log(`\nv2 promotions still standing: ${count}`);
