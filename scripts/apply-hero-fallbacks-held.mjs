#!/usr/bin/env node
/**
 * Apply chain-brand hero image fallbacks to held listings missing a hero.
 *
 * Per memory rule `feedback_street_view_heroes_intentional.md`:
 *   Street-view URLs were manually curated and often 403.
 *   We do NOT auto-generate street-view URLs here — chain-brand only.
 *
 * Listings without a parent_chain match stay held until manual hero upload
 * or better data (Google Places photo, facility photo from Crawl4AI, etc.).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Inline-parse chain-brand-images.ts since we're in a .mjs script.
const chainBrandSrc = readFileSync('lib/chain-brand-images.ts', 'utf8');
const CHAIN_BRAND = new Map();
const STORAGE = 'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/chain-brands';
// Match: 'Chain Name': `${STORAGE}/file.jpg`  OR  'Chain Name': 'https://...'  OR  'Chain Name': ['https://...', ...]
const re = /'([^']+)':\s*(?:`\$\{STORAGE\}\/([^`]+)`|'(https?:[^']+)'|\[([^\]]+)\])/g;
let m;
while ((m = re.exec(chainBrandSrc))) {
  const name = m[1];
  if (m[2]) CHAIN_BRAND.set(name, `${STORAGE}/${m[2]}`);
  else if (m[3]) CHAIN_BRAND.set(name, m[3]);
  else if (m[4]) {
    const first = m[4].match(/'(https?:[^']+)'/);
    if (first) CHAIN_BRAND.set(name, first[1]);
  }
}
console.log(`Loaded ${CHAIN_BRAND.size} chain-brand images\n`);

// Pull all held listings
const held = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('id, name, parent_chain, hero_image, google_photo_url, street_view_url')
    .eq('is_touchless', true).eq('is_approved', false)
    .range(offset, offset+999);
  if (!data || data.length === 0) break;
  held.push(...data);
  if (data.length < 1000) break;
}

const noHero = held.filter(l => !(l.hero_image || l.google_photo_url || l.street_view_url));
console.log(`${noHero.length} held listings without any hero image\n`);

let chainApplied = 0, noChainMatch = 0, noParentChain = 0;
const unmatchedChains = new Map();

for (const l of noHero) {
  if (!l.parent_chain) { noParentChain++; continue; }
  const brandUrl = CHAIN_BRAND.get(l.parent_chain);
  if (!brandUrl) {
    noChainMatch++;
    unmatchedChains.set(l.parent_chain, (unmatchedChains.get(l.parent_chain) || 0) + 1);
    continue;
  }
  const { error } = await sb.from('listings')
    .update({ hero_image: brandUrl, hero_image_source: 'chain-brand' })
    .eq('id', l.id);
  if (error) { console.error(`${l.id}: ${error.message}`); continue; }
  chainApplied++;
}

console.log(`\nApplied chain-brand hero: ${chainApplied}`);
console.log(`No parent_chain set:      ${noParentChain}`);
console.log(`parent_chain not in map:  ${noChainMatch}`);
if (unmatchedChains.size) {
  console.log(`\nUnmatched parent_chain values (add to lib/chain-brand-images.ts if touchless):`);
  [...unmatchedChains.entries()].sort((a,b)=>b[1]-a[1]).forEach(([c,n])=>console.log(`  ${n.toString().padStart(4)} — ${c}`));
}
