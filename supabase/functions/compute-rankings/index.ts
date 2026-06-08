/**
 * compute-rankings — Pre-compute Best Of rankings for all metro areas.
 *
 * For each metro area (~95), queries touchless listings within the bounding box,
 * filters by haversine distance, scores them, and upserts the top 10 into
 * the `best_of_rankings` table.
 *
 * Invoke manually: curl -X POST <URL>/functions/v1/compute-rankings -H "Authorization: Bearer <ANON_KEY>"
 * Scheduled: daily at 3 AM UTC via pg_cron.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { METRO_AREAS } from './metros.ts';

// ── Supabase client ─────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Haversine helpers (duplicated from lib/metro-areas.ts) ──────────────

const EARTH_RADIUS_MILES = 3958.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function boundingBox(lat: number, lng: number, radiusMiles: number) {
  const latDelta = radiusMiles / 69.0;
  const lngDelta = radiusMiles / (69.0 * Math.cos(toRad(lat)));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

// ── Scoring (duplicated from lib/metro-scoring.ts) ──────────────────────

interface ListingRow {
  id: string;
  rating: number | null;
  review_count: number | null;
  touchless_sentiment: string | null;
  hero_image: string | null;
  google_photo_url: string | null;
  hours: Record<string, string> | null;
  phone: string | null;
  amenities: string[] | null;
  website: string | null;
  is_featured: boolean | null;
  latitude: number | null;
  longitude: number | null;
}

function scoreListing(listing: ListingRow, touchlessReviewCount: number): number {
  let score = 0;

  // Rating (30 points max)
  const rating = listing.rating ?? 0;
  score += (rating / 5) * 30;

  // Review volume (25 points max) — log-scaled, 500 reviews = full 25
  const reviewCount = listing.review_count ?? 0;
  const reviewScore = Math.min(Math.log10(reviewCount + 1) / Math.log10(500), 1);
  score += reviewScore * 25;

  // Touchless evidence (15 points max)
  if (touchlessReviewCount >= 3) {
    score += 15;
  } else if (touchlessReviewCount >= 1) {
    score += 10;
  }

  // Touchless sentiment (10 points max)
  const sentiment = listing.touchless_sentiment;
  if (sentiment === 'positive') score += 10;
  else if (sentiment === 'negative') score += 0;
  else score += 5; // neutral or null

  // Data completeness (10 points max)
  let completeness = 0;
  if (listing.hero_image || listing.google_photo_url) completeness += 3;
  if (listing.hours && Object.keys(listing.hours).length > 0) completeness += 2;
  if (listing.phone) completeness += 2;
  if (listing.amenities && listing.amenities.length > 0) completeness += 2;
  if (listing.website) completeness += 1;
  score += completeness;

  // Featured bonus (10 points max)
  if (listing.is_featured) {
    score += 10;
  }

  return Math.round(score * 10) / 10;
}

// Metro area definitions live in ./metros.ts, AUTO-GENERATED from the
// canonical site list (lib/metro-areas.ts) so this job and the website
// always cover the SAME metros. Regenerate via
// scripts/gen-compute-rankings-metros.mjs.

// ── Columns we need for scoring ─────────────────────────────────────────

const SCORING_COLUMNS =
  'id, rating, review_count, touchless_sentiment, hero_image, google_photo_url, hours, phone, amenities, website, is_featured, latitude, longitude';

// ── Main logic ──────────────────────────────────────────────────────────

async function computeAllRankings(): Promise<{ metrosProcessed: number; rankingsInserted: number }> {
  const now = new Date().toISOString();
  let totalRankings = 0;

  // Collect all ranking rows to insert in one batch
  const allRankings: {
    listing_id: string;
    metro_slug: string;
    metro_name: string;
    rank: number;
    score: number;
    computed_at: string;
  }[] = [];

  for (const metro of METRO_AREAS) {
    // 1. Bounding box query
    const box = boundingBox(metro.lat, metro.lng, metro.radiusMiles);

    const { data: listings, error } = await supabase
      .from('listings')
      .select(SCORING_COLUMNS)
      .eq('is_touchless', true)
      .gte('latitude', box.minLat)
      .lte('latitude', box.maxLat)
      .gte('longitude', box.minLng)
      .lte('longitude', box.maxLng)
      .order('rating', { ascending: false })
      .limit(1000);

    if (error || !listings || listings.length === 0) continue;

    // 2. Filter to precise radius using haversine
    const inRadius = (listings as ListingRow[]).filter((l) => {
      if (l.latitude == null || l.longitude == null) return false;
      return haversineDistance(metro.lat, metro.lng, l.latitude, l.longitude) <= metro.radiusMiles;
    });

    if (inRadius.length === 0) continue;

    // 3. Fetch touchless review snippet counts for these listings
    const listingIds = inRadius.map((l) => l.id);
    const { data: snippetRows } = await supabase
      .from('review_snippets')
      .select('listing_id')
      .in('listing_id', listingIds)
      .eq('is_touchless_evidence', true);

    const reviewCounts = new Map<string, number>();
    if (snippetRows) {
      for (const row of snippetRows) {
        reviewCounts.set(row.listing_id, (reviewCounts.get(row.listing_id) ?? 0) + 1);
      }
    }

    // 4. Score and rank — take top 10 (badges support rank ≤ 10)
    const scored = inRadius
      .map((l) => ({
        id: l.id,
        score: scoreListing(l, reviewCounts.get(l.id) ?? 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    for (let i = 0; i < scored.length; i++) {
      allRankings.push({
        listing_id: scored[i].id,
        metro_slug: metro.slug,
        metro_name: metro.displayName,
        rank: i + 1,
        score: scored[i].score,
        computed_at: now,
      });
    }
  }

  // 5. Full refresh: delete all existing rows, then insert new ones
  const { error: deleteError } = await supabase
    .from('best_of_rankings')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all rows (neq on a uuid that doesn't exist)

  if (deleteError) {
    console.error('Failed to delete existing rankings:', deleteError);
    throw new Error(`Delete failed: ${deleteError.message}`);
  }

  // Insert in batches of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < allRankings.length; i += BATCH_SIZE) {
    const batch = allRankings.slice(i, i + BATCH_SIZE);
    const { error: insertError } = await supabase
      .from('best_of_rankings')
      .insert(batch);

    if (insertError) {
      console.error(`Failed to insert batch ${i / BATCH_SIZE + 1}:`, insertError);
      throw new Error(`Insert failed: ${insertError.message}`);
    }
    totalRankings += batch.length;
  }

  return { metrosProcessed: METRO_AREAS.length, rankingsInserted: totalRankings };
}

// ── HTTP handler ────────────────────────────────────────────────────────

serve(async (req) => {
  try {
    const start = Date.now();
    const result = await computeAllRankings();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`Computed rankings: ${result.rankingsInserted} rows across ${result.metrosProcessed} metros in ${elapsed}s`);

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
        elapsedSeconds: Number(elapsed),
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (err) {
    console.error('compute-rankings error:', err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { headers: { 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
