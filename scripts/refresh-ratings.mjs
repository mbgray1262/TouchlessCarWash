/**
 * refresh-ratings.mjs
 *
 * Refreshes rating + review_count for all approved touchless listings
 * that have a google_place_id, using the Google Places Details API.
 *
 * Cost: Basic fields (rating, user_ratings_total) = $17/1,000 requests
 * ~4,000 listings ≈ $0.07 per run
 *
 * Usage: node scripts/refresh-ratings.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env vars from .env.local
const envPath = resolve(__dirname, '../.env.local');
const envVars = {};
try {
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) envVars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch {
  console.error('Could not read .env.local');
  process.exit(1);
}

const SUPABASE_URL = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY'] || envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const GOOGLE_KEY   = envVars['GOOGLE_PLACES_API_KEY'];

if (!SUPABASE_URL || !SUPABASE_KEY || !GOOGLE_KEY) {
  console.error('Missing required env vars. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY), GOOGLE_PLACES_API_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const BATCH_SIZE   = 10;   // concurrent Places API requests
const DELAY_MS     = 150;  // ms between batches (keeps well under 100 QPS)

async function fetchAllListings() {
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from('listings')
      .select('id, google_place_id, rating, review_count')
      .eq('is_touchless', true)
      .eq('is_approved', true)
      .not('google_place_id', 'is', null)
      .range(offset, offset + 999);
    if (error) { console.error('Fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

async function getPlaceRating(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,user_ratings_total&key=${GOOGLE_KEY}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== 'OK') return null;
    return {
      rating: json.result?.rating ?? null,
      review_count: json.result?.user_ratings_total ?? null,
    };
  } catch {
    return null;
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('Fetching listings with google_place_id...');
  const listings = await fetchAllListings();
  console.log(`Found ${listings.length} listings to refresh.\n`);

  let updated = 0, skipped = 0, failed = 0;
  const start = Date.now();

  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (listing) => {
      const fresh = await getPlaceRating(listing.google_place_id);
      if (!fresh) { failed++; return; }

      // Only write to DB if something actually changed
      const ratingChanged     = fresh.rating !== null && Math.abs((fresh.rating ?? 0) - (listing.rating ?? 0)) >= 0.05;
      const reviewCountChanged = fresh.review_count !== null && fresh.review_count !== listing.review_count;

      if (!ratingChanged && !reviewCountChanged) { skipped++; return; }

      const patch = {};
      if (ratingChanged)      patch.rating       = fresh.rating;
      if (reviewCountChanged) patch.review_count  = fresh.review_count;

      const { error } = await sb.from('listings').update(patch).eq('id', listing.id);
      if (error) { failed++; } else { updated++; }
    }));

    await sleep(DELAY_MS);

    // Progress every 100 listings
    const done = Math.min(i + BATCH_SIZE, listings.length);
    if (done % 100 === 0 || done === listings.length) {
      const pct = ((done / listings.length) * 100).toFixed(0);
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      process.stdout.write(`\r[${pct}%] ${done}/${listings.length} processed — ${updated} updated, ${skipped} unchanged, ${failed} failed (${elapsed}s)`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\nDone in ${elapsed}s.`);
  console.log(`  Updated:   ${updated}`);
  console.log(`  Unchanged: ${skipped}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Est. cost: $${(listings.length / 1000 * 0.017).toFixed(3)}`);
}

main().catch(console.error);
