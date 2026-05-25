#!/usr/bin/env node
/**
 * Global audit: find ALL listings with hero_image URLs likely to be broken.
 *
 * Two known-bad patterns from the Sheetz issue:
 *   1) places.googleapis.com photo refs — expire and 404
 *   2) Hot-linked vendor websites returning promo banners, not facility photos
 *      (e.g. sheetz.com/_next/image promo_hiring banner across 39 listings)
 *
 * Also flag any non-Supabase, non-streetview hero URL repeating across many
 * listings — that's the signature of a scraped junk image like the Sheetz banner.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(
  fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l => {
    const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Pull all listings with a hero_image
let all = [];
let offset = 0;
const PAGE = 1000;
while (true) {
  const { data, error } = await supabase
    .from('listings')
    .select('id, name, city, state, hero_image, hero_image_source, parent_chain, is_approved')
    .not('hero_image', 'is', null)
    .range(offset, offset + PAGE - 1);
  if (error) { console.error(error); process.exit(1); }
  all = all.concat(data);
  if (data.length < PAGE) break;
  offset += PAGE;
}
console.log(`Total listings with hero_image: ${all.length}`);

// Category 1: places.googleapis.com (expired refs)
const placesApi = all.filter(r => r.hero_image.includes('places.googleapis.com'));
console.log(`\n[1] places.googleapis.com URLs (almost certainly 404): ${placesApi.length}`);
const placesByChain = {};
for (const r of placesApi) placesByChain[r.parent_chain || '(none)'] = (placesByChain[r.parent_chain || '(none)'] || 0) + 1;
console.table(placesByChain);

// Category 2: Duplicate hero URLs used on multiple listings
// (a hot-linked junk image will appear many times)
const urlCounts = {};
for (const r of all) {
  // Ignore street view (which is location-specific by lat/lng) and supabase storage
  if (r.hero_image.includes('maps.googleapis.com/maps/api/streetview')) continue;
  if (r.hero_image.includes('streetviewpixels')) continue;
  if (r.hero_image.includes('supabase.co/storage')) continue;
  if (r.hero_image.includes('chain-brands/')) continue;
  urlCounts[r.hero_image] = (urlCounts[r.hero_image] || 0) + 1;
}
const dupes = Object.entries(urlCounts).filter(([_, n]) => n >= 5).sort((a, b) => b[1] - a[1]);
console.log(`\n[2] Hero URLs reused on >= 5 listings (likely scraped junk): ${dupes.length} unique URLs`);
let totalDupeRows = 0;
for (const [url, n] of dupes) {
  totalDupeRows += n;
  console.log(`  ${n}x  ${url.substring(0, 130)}`);
}
console.log(`  -> ${totalDupeRows} total rows affected by dupe URLs`);

// Category 3: Test a sample of distinct non-supabase, non-streetview URLs
// to see how many 4xx/5xx
const distinct = [...new Set(all.map(r => r.hero_image))]
  .filter(u => !u.includes('supabase.co/storage') && !u.includes('chain-brands/') && !u.includes('streetview') && !u.includes('places.googleapis.com'));
console.log(`\n[3] Probing ${Math.min(distinct.length, 50)} of ${distinct.length} other distinct URLs...`);
const broken = [];
let probed = 0;
for (const url of distinct.slice(0, 50)) {
  probed++;
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (r.status >= 400) {
      broken.push({ url, status: r.status });
      const count = all.filter(x => x.hero_image === url).length;
      console.log(`  ${r.status} (${count} listings) ${url.substring(0, 100)}`);
    }
  } catch (e) {
    broken.push({ url, error: e.message });
    const count = all.filter(x => x.hero_image === url).length;
    console.log(`  ERR (${count} listings) ${url.substring(0, 100)}: ${e.message}`);
  }
}
console.log(`  -> ${broken.length} of ${probed} sampled URLs are broken`);

// Category 4: Gallery — count gallery photos using places.googleapis.com
const { data: galleryAll } = await supabase
  .from('listings')
  .select('id, photos')
  .not('photos', 'is', null);
let totalGalleryListings = 0, brokenGalleryPhotos = 0, listingsWithBrokenGallery = 0;
for (const r of (galleryAll || [])) {
  if (!Array.isArray(r.photos)) continue;
  totalGalleryListings++;
  let hadBroken = false;
  for (const p of r.photos) {
    if (typeof p === 'string' && p.includes('places.googleapis.com')) {
      brokenGalleryPhotos++;
      hadBroken = true;
    }
  }
  if (hadBroken) listingsWithBrokenGallery++;
}
console.log(`\n[4] Gallery photos broken (places.googleapis.com): ${brokenGalleryPhotos} photos across ${listingsWithBrokenGallery} listings (out of ${totalGalleryListings} with galleries)`);
