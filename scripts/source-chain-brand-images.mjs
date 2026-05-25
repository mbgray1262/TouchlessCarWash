#!/usr/bin/env node
/**
 * For each unregistered chain (≥3 approved listings, not in CHAIN_BRAND_IMAGES),
 * pull the top-rated approved listings that have a supabase-hosted hero image.
 * Output the URLs in a format ready to paste into chain-brand-images.ts.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(
  fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l => {
    const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Read existing chain registry
const txt = fs.readFileSync('lib/chain-brand-images.ts', 'utf8');
const registered = new Set();
for (const m of txt.matchAll(/^\s+'([^']+)':\s*[\[`]/gm)) registered.add(m[1]);

// Pull all approved listings with parent_chain + hero
let all = [];
let lastId = '00000000-0000-0000-0000-000000000000';
while (true) {
  const { data } = await supabase
    .from('listings')
    .select('id, name, city, state, slug, parent_chain, rating, review_count, hero_image, hero_image_source, photos')
    .eq('is_approved', true)
    .not('parent_chain', 'is', null)
    .gt('id', lastId)
    .order('id')
    .limit(1000);
  if (!data || !data.length) break;
  all = all.concat(data);
  lastId = data[data.length-1].id;
  if (data.length < 1000) break;
}

// Group by chain
const byChain = {};
for (const r of all) {
  if (registered.has(r.parent_chain)) continue;
  (byChain[r.parent_chain] ||= []).push(r);
}

// Sort each chain's listings by hero-quality and rating, pick top 3 with supabase heroes
const isGoodHero = (u) =>
  typeof u === 'string' && u.includes('supabase.co/storage') && !u.includes('chain-brands/');

const chainsSorted = Object.entries(byChain)
  .filter(([, rows]) => rows.length >= 3)
  .sort((a, b) => b[1].length - a[1].length);

console.log(`# Brand image candidates for ${chainsSorted.length} unregistered chains\n`);
for (const [chain, rows] of chainsSorted) {
  const withHero = rows.filter(r => isGoodHero(r.hero_image));
  const sortedByRating = withHero.sort((a, b) => {
    const ra = (a.rating || 0) * Math.log10((a.review_count || 0) + 1);
    const rb = (b.rating || 0) * Math.log10((b.review_count || 0) + 1);
    return rb - ra;
  });
  const top = sortedByRating.slice(0, 3);
  console.log(`## ${chain}  (${rows.length} listings, ${withHero.length} with supabase hero)`);
  if (top.length === 0) {
    // No good supabase heroes — list approved listings with photos
    const withPhotos = rows.filter(r => Array.isArray(r.photos) && r.photos.some(p => isGoodHero(p)));
    if (withPhotos.length > 0) {
      console.log(`  (no supabase heroes; ${withPhotos.length} listings have supabase photos in gallery — could promote)`);
    } else {
      console.log(`  (NO supabase-hosted images available; needs manual sourcing)`);
    }
  } else {
    for (const r of top) {
      console.log(`  ★${r.rating || '?'} (${r.review_count || 0}rv) ${r.city},${r.state}`);
      console.log(`    ${r.hero_image}`);
    }
  }
  console.log();
}
