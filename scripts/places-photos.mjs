#!/usr/bin/env node
/**
 * Fetches photos from Google Places API for listings without crawl_snapshot.
 * Classifies with Claude Haiku, rehosts to Supabase storage.
 *
 * Usage: node scripts/places-photos.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!SERVICE_KEY || !ANTHROPIC_KEY || !GOOGLE_API_KEY) {
  console.error('Missing required env vars: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, GOOGLE_MAPS_API_KEY');
  process.exit(1);
}

const MAX_PHOTOS = 10;       // Max total photos per listing
const MAX_NEW_PER_LISTING = 5; // Max new photos to add
const MAX_PLACE_PHOTOS = 8;  // Max photos to fetch from Google Places
const PHOTO_MAX_WIDTH = 1200; // Max width for downloaded photos

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Google Places API ────────────────────────────────────────────────────

async function findPlaceId(name, city, state) {
  const query = `${name} ${city} ${state}`;
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id&key=${GOOGLE_API_KEY}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 'OK' && data.candidates?.length > 0) {
      return data.candidates[0].place_id;
    }
    return null;
  } catch {
    return null;
  }
}

async function getPlacePhotos(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=photos&key=${GOOGLE_API_KEY}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status === 'OK' && data.result?.photos) {
      return data.result.photos.slice(0, MAX_PLACE_PHOTOS);
    }
    return [];
  } catch {
    return [];
  }
}

function getPhotoUrl(photoReference) {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${PHOTO_MAX_WIDTH}&photo_reference=${encodeURIComponent(photoReference)}&key=${GOOGLE_API_KEY}`;
}

// ── Image Helpers ────────────────────────────────────────────────────────

async function fetchImageAsBase64(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const mediaType = ct.split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 5000) return null;      // Too small
    if (buffer.byteLength > 8_000_000) return null;  // Too big
    return { base64: Buffer.from(buffer).toString('base64'), mediaType, buffer };
  } catch {
    return null;
  }
}

// ── AI Classification ────────────────────────────────────────────────────

async function classifyPhoto(photoUrl) {
  const img = await fetchImageAsBase64(photoUrl);
  if (!img) return { verdict: 'BAD_OTHER', reason: 'Could not fetch image', img: null };

  const prompt = `You are classifying images for a touchless car wash photo gallery. Be VERY STRICT — only approve genuine, high-quality photographs that clearly show a car wash FACILITY.

GOOD — Real photograph where the car wash BUILDING, TUNNEL, BAY, or EQUIPMENT is clearly visible.
BAD_CONTACT — Shows spinning brushes, cloth strips, or mop curtains physically touching a vehicle.
BAD_OTHER — Logo, icon, illustration, coupon, map, screenshot, vehicle-only photo, low-res, etc.

KEY RULE: If the photo is mostly a CAR and you cannot clearly see the wash building/tunnel/equipment, classify as BAD_OTHER.

Reply with exactly: VERDICT: one-line reason`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5', max_tokens: 80,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } },
            { type: 'text', text: prompt },
          ]}],
        }),
      });
      if (res.status === 429 || res.status === 529) {
        await new Promise(r => setTimeout(r, 5000 * attempt));
        continue;
      }
      if (!res.ok) return { verdict: 'BAD_OTHER', reason: `API ${res.status}`, img: null };
      const data = await res.json();
      const text = (data.content?.[0]?.text ?? '').trim();
      if (/\bGOOD\b/.test(text) && !/\bBAD\b/.test(text)) return { verdict: 'GOOD', reason: text, img };
      if (/\bBAD_CONTACT\b/.test(text)) return { verdict: 'BAD_CONTACT', reason: text, img: null };
      return { verdict: 'BAD_OTHER', reason: text, img: null };
    } catch {
      if (attempt < 3) { await new Promise(r => setTimeout(r, 3000)); continue; }
      return { verdict: 'BAD_OTHER', reason: 'Exception', img: null };
    }
  }
  return { verdict: 'BAD_OTHER', reason: 'Max attempts', img: null };
}

// ── Storage ──────────────────────────────────────────────────────────────

async function uploadToStorage(imageBuffer, contentType, listingId, slot) {
  try {
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const path = `listings/${listingId}/places_${slot}.${ext}`;
    const { error } = await supabase.storage
      .from('listing-photos')
      .upload(path, imageBuffer, { contentType: contentType.split(';')[0].trim(), upsert: true });
    if (error) { console.error(`    Upload error: ${error.message}`); return null; }
    const { data: { publicUrl } } = supabase.storage.from('listing-photos').getPublicUrl(path);
    return publicUrl;
  } catch { return null; }
}

// ── Hero Selection ───────────────────────────────────────────────────────

async function pickBestHero(urls) {
  if (urls.length <= 1) return 0;
  const images = await Promise.all(urls.slice(0, 6).map(u => fetchImageAsBase64(u)));
  const valid = images.map((img, i) => ({ img, i })).filter(({ img }) => img !== null);
  if (valid.length <= 1) return valid[0]?.i ?? 0;

  const imageBlocks = valid.flatMap(({ img, i }) => [
    { type: 'text', text: `Photo ${i + 1}:` },
    { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } },
  ]);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5', max_tokens: 10,
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: 'Pick the best hero image for a touchless car wash listing. Prefer exterior building shots. Reply with only the photo number.' }] }],
      }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const num = parseInt((data.content?.[0]?.text ?? '').trim(), 10);
    if (!isNaN(num) && num >= 1 && num <= urls.length) return num - 1;
  } catch { /* fall through */ }
  return 0;
}

// ── Process one listing ──────────────────────────────────────────────────

async function processListing(listing) {
  // Step 1: Find the Google Place
  const placeId = await findPlaceId(listing.name, listing.city, listing.state);
  if (!placeId) {
    return { status: 'no_place', approved: 0 };
  }

  // Step 2: Get photo references
  const photos = await getPlacePhotos(placeId);
  if (photos.length === 0) {
    return { status: 'no_photos', approved: 0 };
  }

  // Step 3: Determine how many slots we can fill
  const existingPhotos = (listing.photos || []).filter(p =>
    p.includes('supabase.co/storage') || p.includes('lh3.googleusercontent.com')
  );
  const slotsToFill = Math.min(Math.max(0, MAX_PHOTOS - existingPhotos.length), MAX_NEW_PER_LISTING);

  if (slotsToFill === 0) {
    return { status: 'full', approved: 0, existing: existingPhotos.length };
  }

  // Step 4: Download, classify, and upload each photo
  const rehosted = [];
  for (let i = 0; i < photos.length && rehosted.length < slotsToFill; i++) {
    const photoUrl = getPhotoUrl(photos[i].photo_reference);
    const result = await classifyPhoto(photoUrl);

    if (result.verdict === 'GOOD' && result.img) {
      const stored = await uploadToStorage(
        result.img.buffer,
        result.img.mediaType,
        listing.id,
        `${i}_${Date.now()}`
      );
      if (stored) rehosted.push(stored);
    }

    // Brief pause between API calls
    await new Promise(r => setTimeout(r, 200));
  }

  // Step 5: Merge gallery and maybe re-rank hero
  const allPhotos = [...existingPhotos, ...rehosted];
  let heroUrl = listing.hero_image;
  let heroChanged = false;

  if (rehosted.length > 0 && allPhotos.length >= 2) {
    const src = listing.hero_image_source;
    if (src !== 'manual' && src !== 'manual_upload') {
      const bestIdx = await pickBestHero(allPhotos);
      if (allPhotos[bestIdx] !== heroUrl) { heroUrl = allPhotos[bestIdx]; heroChanged = true; }
    }
  }
  if (!heroUrl && allPhotos.length > 0) {
    heroUrl = allPhotos.length > 1 ? allPhotos[await pickBestHero(allPhotos)] : allPhotos[0];
    heroChanged = true;
  }

  // Step 6: Deduplicate gallery — hero first
  let gallery = heroUrl ? [heroUrl, ...allPhotos.filter(u => u !== heroUrl)] : allPhotos;

  // Step 7: Update listing
  const updateData = { photos: gallery, crawl_status: 'mined' };
  if (heroUrl && heroChanged) {
    updateData.hero_image = heroUrl;
    updateData.hero_image_source = 'places_api';
  }
  await supabase.from('listings').update(updateData).eq('id', listing.id);

  return { status: 'ok', approved: rehosted.length, heroChanged, candidates: photos.length };
}

// ── Main Loop ────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Google Places photo fetcher starting...');

  // Fetch all listings that need processing
  const allListings = [];
  let offset = 0;
  const PAGE = 500;
  while (true) {
    const { data, error } = await supabase
      .from('listings')
      .select('id, name, city, state, photos, hero_image, hero_image_source')
      .eq('is_touchless', true)
      .is('crawl_snapshot', null)
      .range(offset, offset + PAGE - 1);
    if (error) { console.error('Fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    allListings.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`📋 ${allListings.length} listings to process\n`);

  let processed = 0;
  let totalApproved = 0;
  let totalHeroChanged = 0;
  let noPlace = 0;
  let noPhotos = 0;
  let full = 0;
  const startTime = Date.now();

  for (const listing of allListings) {
    processed++;
    process.stdout.write(`[${processed}/${allListings.length}] ${listing.name} (${listing.city}, ${listing.state}) ... `);

    try {
      const result = await processListing(listing);

      switch (result.status) {
        case 'no_place':
          noPlace++;
          console.log('⚠️ place not found');
          // Still mark as mined so we don't retry
          await supabase.from('listings').update({ crawl_status: 'mined' }).eq('id', listing.id);
          break;
        case 'no_photos':
          noPhotos++;
          console.log('📷 no photos on Google');
          await supabase.from('listings').update({ crawl_status: 'mined' }).eq('id', listing.id);
          break;
        case 'full':
          full++;
          console.log(`already full (${result.existing} photos)`);
          await supabase.from('listings').update({ crawl_status: 'mined' }).eq('id', listing.id);
          break;
        case 'ok':
          totalApproved += result.approved;
          if (result.heroChanged) totalHeroChanged++;
          console.log(`${result.candidates} candidates → ${result.approved} approved, hero: ${result.heroChanged ? 'updated' : 'unchanged'}`);
          break;
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      await supabase.from('listings').update({ crawl_status: 'mined' }).eq('id', listing.id);
    }

    // Pause to respect rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n✅ All done!`);
  console.log(`📊 Summary:`);
  console.log(`   ${processed} listings processed`);
  console.log(`   ${totalApproved} photos approved & uploaded`);
  console.log(`   ${totalHeroChanged} hero images updated`);
  console.log(`   ${noPlace} places not found on Google`);
  console.log(`   ${noPhotos} places with no photos`);
  console.log(`   ${full} listings already full`);
  console.log(`⏱  Total time: ${totalTime} minutes`);
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });
