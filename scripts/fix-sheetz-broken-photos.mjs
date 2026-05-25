#!/usr/bin/env node
/**
 * Clean up broken Sheetz photo URLs so the chain brand image fallback works.
 *
 * Three classes of breakage on Sheetz listings:
 *   1) hero_image = sheetz.com promo_hiring banner (scraped from website; same junk URL on 39 listings)
 *   2) hero_image = places.googleapis.com photo reference that has since expired and 404s (14 listings)
 *   3) photos[] entries pointing at places.googleapis.com that 404 (38 photos across the gallery)
 *
 * Fix: NULL out the hero, strip the broken gallery entries, set parent_chain='Sheetz'
 * on approved Sheetz listings that don't have it so CHAIN_BRAND_IMAGES['Sheetz']
 * takes over on the public site.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');

const env = Object.fromEntries(
  fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l => {
    const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const isBrokenUrl = (u) =>
  typeof u === 'string' &&
  (u.includes('www.sheetz.com/_next/image') || u.includes('places.googleapis.com'));

// 1) Null out broken hero_images
const { data: brokenHeros, error: e1 } = await supabase
  .from('listings')
  .select('id, name, city, state, hero_image, hero_image_source')
  .ilike('name', '%sheetz%')
  .or('hero_image.ilike.%sheetz.com/_next/image%,hero_image.ilike.%places.googleapis.com%');
if (e1) throw e1;

console.log(`[hero] ${brokenHeros.length} broken hero_image rows to null`);
if (!DRY_RUN) {
  for (const row of brokenHeros) {
    const { error } = await supabase
      .from('listings')
      .update({ hero_image: null, hero_image_source: null })
      .eq('id', row.id);
    if (error) console.error(`  fail ${row.id}: ${error.message}`);
  }
}

// 2) Strip broken entries from photos arrays
const { data: galleryRows, error: e2 } = await supabase
  .from('listings')
  .select('id, name, city, state, photos')
  .ilike('name', '%sheetz%')
  .not('photos', 'is', null);
if (e2) throw e2;

let touched = 0, removed = 0;
for (const row of galleryRows) {
  if (!Array.isArray(row.photos)) continue;
  const cleaned = row.photos.filter(p => !isBrokenUrl(p));
  if (cleaned.length !== row.photos.length) {
    removed += row.photos.length - cleaned.length;
    touched++;
    if (!DRY_RUN) {
      const { error } = await supabase
        .from('listings')
        .update({ photos: cleaned })
        .eq('id', row.id);
      if (error) console.error(`  fail ${row.id}: ${error.message}`);
    }
  }
}
console.log(`[gallery] ${touched} listings updated, ${removed} broken photos removed`);

// 3) Backfill parent_chain='Sheetz' on approved Sheetz missing it
const { data: missingChain, error: e3 } = await supabase
  .from('listings')
  .select('id, name, parent_chain, is_approved')
  .ilike('name', '%sheetz%')
  .eq('is_approved', true)
  .or('parent_chain.is.null,parent_chain.neq.Sheetz');
if (e3) throw e3;

console.log(`[parent_chain] ${missingChain.length} approved Sheetz to flag with parent_chain='Sheetz'`);
if (!DRY_RUN && missingChain.length > 0) {
  const { error } = await supabase
    .from('listings')
    .update({ parent_chain: 'Sheetz' })
    .in('id', missingChain.map(r => r.id));
  if (error) console.error(`  fail: ${error.message}`);
}

console.log(DRY_RUN ? '\n--dry-run; no changes written' : '\nDone.');
