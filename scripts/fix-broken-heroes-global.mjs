#!/usr/bin/env node
/**
 * Global hero/gallery cleanup. Nulls hero_image (and strips photos[]) for URL
 * patterns known to be broken or wrong:
 *
 *   - places.googleapis.com -> expired Places photo refs (404)
 *   - /images/card-fallback.svg -> site placeholder accidentally saved as hero
 *   - img.youtube.com/vi/...thumbnails -> not facility photos
 *   - Vendor URLs repeated on >=5 distinct listings -> marketing banner / logo /
 *     QR code / "Main store image" used as hero across many locations
 *
 * Public fallback chain (state/[state]/[city]/[slug]/page.tsx:276):
 *   chainBrandImage ?? hero_image ?? google_photo_url ?? street_view_url
 * So nulling broken heroes is safe — listing keeps a working image via fallback.
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

const isDefinitelyBroken = (u) => {
  if (typeof u !== 'string') return false;
  if (u.includes('places.googleapis.com')) return true;
  if (u === '/images/card-fallback.svg') return true;
  if (u.includes('img.youtube.com/vi/') && u.endsWith('/maxresdefault.jpg')) return true;
  return false;
};

// PHASE 1 — pattern-based UPDATE (no ID list, no pagination needed)
console.log('[1] Nulling definite-broken hero URLs via pattern match...');
async function nullByPattern(filter, label) {
  if (DRY_RUN) {
    const { count } = await supabase.from('listings').select('*', { count: 'exact', head: true }).filter(...filter);
    console.log(`  [dry-run] would null ${count} ${label}`);
    return count;
  }
  const { data, error } = await supabase
    .from('listings')
    .update({ hero_image: null, hero_image_source: null })
    .filter(...filter)
    .select('id');
  if (error) console.error(`  fail ${label}: ${error.message}`);
  console.log(`  nulled ${data?.length || 0} ${label}`);
  return data?.length || 0;
}
await nullByPattern(['hero_image', 'ilike', '%places.googleapis.com%'], 'places.googleapis.com');
await nullByPattern(['hero_image', 'eq', '/images/card-fallback.svg'], '/images/card-fallback.svg');
await nullByPattern(['hero_image', 'ilike', '%img.youtube.com/vi/%'], 'youtube thumbnails');

// PHASE 2 — find URLs repeated on >=5 listings (paginated select with stable order)
console.log('\n[2] Finding hero URLs repeated on >=5 listings...');
let all = [];
let lastId = '00000000-0000-0000-0000-000000000000';
while (true) {
  const { data, error } = await supabase
    .from('listings')
    .select('id, hero_image')
    .not('hero_image', 'is', null)
    .gt('id', lastId)
    .order('id', { ascending: true })
    .limit(1000);
  if (error) throw error;
  if (!data.length) break;
  all = all.concat(data);
  lastId = data[data.length - 1].id;
  if (data.length < 1000) break;
}
console.log(`  scanned ${all.length} listings with hero_image`);

const urlCounts = {};
for (const r of all) {
  const u = r.hero_image;
  if (u.includes('supabase.co/storage')) continue;
  if (u.includes('chain-brands/')) continue;
  if (u.includes('maps.googleapis.com/maps/api/streetview')) continue;
  if (u.includes('streetviewpixels')) continue;
  urlCounts[u] = (urlCounts[u] || 0) + 1;
}
const dupes = Object.entries(urlCounts).filter(([_, n]) => n >= 5);
console.log(`  ${dupes.length} URLs duplicated >=5 times`);

let dupeNulled = 0;
for (const [url, count] of dupes) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would null ${count}x  ${url.substring(0, 100)}`);
    dupeNulled += count;
    continue;
  }
  const { data, error } = await supabase
    .from('listings')
    .update({ hero_image: null, hero_image_source: null })
    .eq('hero_image', url)
    .select('id');
  if (error) console.error(`  fail ${url.substring(0,60)}: ${error.message}`);
  dupeNulled += data?.length || 0;
}
console.log(`  ${dupeNulled} listings cleared by dupe pass`);

// PHASE 3 — strip definite-broken from photos[] (paginated with stable order)
console.log('\n[3] Cleaning gallery photos...');
let galleryAll = [];
lastId = '00000000-0000-0000-0000-000000000000';
while (true) {
  const { data, error } = await supabase
    .from('listings')
    .select('id, photos')
    .not('photos', 'is', null)
    .gt('id', lastId)
    .order('id', { ascending: true })
    .limit(1000);
  if (error) throw error;
  if (!data.length) break;
  galleryAll = galleryAll.concat(data);
  lastId = data[data.length - 1].id;
  if (data.length < 1000) break;
}
console.log(`  scanned ${galleryAll.length} listings with galleries`);

let touched = 0, removed = 0;
for (const r of galleryAll) {
  if (!Array.isArray(r.photos)) continue;
  const cleaned = r.photos.filter(p => !isDefinitelyBroken(p));
  if (cleaned.length !== r.photos.length) {
    removed += r.photos.length - cleaned.length;
    touched++;
    if (!DRY_RUN) {
      const { error } = await supabase
        .from('listings')
        .update({ photos: cleaned })
        .eq('id', r.id);
      if (error) console.error(`  fail ${r.id}: ${error.message}`);
    }
  }
}
console.log(`  ${touched} listings updated, ${removed} broken photos removed`);

console.log(DRY_RUN ? '\n--dry-run; no changes written' : '\nDone.');
