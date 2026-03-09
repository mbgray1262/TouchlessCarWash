/**
 * compute-rankings — Pre-compute Best Of rankings for all metro areas.
 *
 * For each metro area (~95), queries touchless listings within the bounding box,
 * filters by haversine distance, scores them, and upserts the top 3 into
 * the `best_of_rankings` table.
 *
 * Invoke manually: curl -X POST <URL>/functions/v1/compute-rankings -H "Authorization: Bearer <ANON_KEY>"
 * Scheduled: daily at 3 AM UTC via pg_cron.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

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

// ── Metro area definitions (duplicated from lib/metro-areas.ts) ─────────

type Metro = {
  name: string;
  displayName: string;
  slug: string;
  lat: number;
  lng: number;
  radiusMiles: number;
};

const METRO_AREAS: Metro[] = [
  // Northeast
  { name: 'New York City', displayName: 'New York City, NY', slug: 'new-york-city', lat: 40.7128, lng: -74.0060, radiusMiles: 30 },
  { name: 'Boston', displayName: 'Boston, MA', slug: 'boston', lat: 42.3601, lng: -71.0589, radiusMiles: 25 },
  { name: 'Philadelphia', displayName: 'Philadelphia, PA', slug: 'philadelphia', lat: 39.9526, lng: -75.1652, radiusMiles: 30 },
  { name: 'Pittsburgh', displayName: 'Pittsburgh, PA', slug: 'pittsburgh', lat: 40.4406, lng: -79.9959, radiusMiles: 25 },
  { name: 'Hartford', displayName: 'Hartford, CT', slug: 'hartford', lat: 41.7658, lng: -72.6734, radiusMiles: 25 },
  { name: 'Providence', displayName: 'Providence, RI', slug: 'providence', lat: 41.824, lng: -71.4128, radiusMiles: 25 },
  { name: 'Buffalo', displayName: 'Buffalo, NY', slug: 'buffalo', lat: 42.8864, lng: -78.8784, radiusMiles: 25 },
  { name: 'Rochester', displayName: 'Rochester, NY', slug: 'rochester', lat: 43.1566, lng: -77.6088, radiusMiles: 25 },
  { name: 'Albany', displayName: 'Albany, NY', slug: 'albany', lat: 42.6526, lng: -73.7562, radiusMiles: 25 },
  { name: 'Syracuse', displayName: 'Syracuse, NY', slug: 'syracuse', lat: 43.0481, lng: -76.1474, radiusMiles: 25 },
  { name: 'Northern New Jersey', displayName: 'Northern NJ', slug: 'northern-new-jersey', lat: 40.8568, lng: -74.2263, radiusMiles: 20 },
  { name: 'Baltimore', displayName: 'Baltimore, MD', slug: 'baltimore', lat: 39.2904, lng: -76.6122, radiusMiles: 25 },
  { name: 'Washington DC', displayName: 'Washington, DC', slug: 'washington-dc', lat: 38.9072, lng: -77.0369, radiusMiles: 30 },
  // Southeast
  { name: 'Miami', displayName: 'Miami, FL', slug: 'miami', lat: 25.7617, lng: -80.1918, radiusMiles: 30 },
  { name: 'Tampa', displayName: 'Tampa, FL', slug: 'tampa', lat: 27.9506, lng: -82.4572, radiusMiles: 30 },
  { name: 'Orlando', displayName: 'Orlando, FL', slug: 'orlando', lat: 28.5383, lng: -81.3792, radiusMiles: 30 },
  { name: 'Jacksonville', displayName: 'Jacksonville, FL', slug: 'jacksonville', lat: 30.3322, lng: -81.6557, radiusMiles: 25 },
  { name: 'Fort Myers', displayName: 'Fort Myers, FL', slug: 'fort-myers', lat: 26.6406, lng: -81.8723, radiusMiles: 25 },
  { name: 'Atlanta', displayName: 'Atlanta, GA', slug: 'atlanta', lat: 33.7490, lng: -84.3880, radiusMiles: 30 },
  { name: 'Charlotte', displayName: 'Charlotte, NC', slug: 'charlotte', lat: 35.2271, lng: -80.8431, radiusMiles: 25 },
  { name: 'Raleigh-Durham', displayName: 'Raleigh-Durham, NC', slug: 'raleigh-durham', lat: 35.7796, lng: -78.6382, radiusMiles: 25 },
  { name: 'Nashville', displayName: 'Nashville, TN', slug: 'nashville', lat: 36.1627, lng: -86.7816, radiusMiles: 25 },
  { name: 'Memphis', displayName: 'Memphis, TN', slug: 'memphis', lat: 35.1495, lng: -90.0490, radiusMiles: 25 },
  { name: 'Louisville', displayName: 'Louisville, KY', slug: 'louisville', lat: 38.2527, lng: -85.7585, radiusMiles: 25 },
  { name: 'Richmond', displayName: 'Richmond, VA', slug: 'richmond', lat: 37.5407, lng: -77.4360, radiusMiles: 25 },
  { name: 'Virginia Beach', displayName: 'Virginia Beach, VA', slug: 'virginia-beach', lat: 36.8529, lng: -75.9780, radiusMiles: 25 },
  { name: 'Charleston', displayName: 'Charleston, SC', slug: 'charleston', lat: 32.7765, lng: -79.9311, radiusMiles: 25 },
  { name: 'New Orleans', displayName: 'New Orleans, LA', slug: 'new-orleans', lat: 29.9511, lng: -90.0715, radiusMiles: 25 },
  { name: 'Birmingham', displayName: 'Birmingham, AL', slug: 'birmingham', lat: 33.5207, lng: -86.8025, radiusMiles: 25 },
  { name: 'Knoxville', displayName: 'Knoxville, TN', slug: 'knoxville', lat: 35.9606, lng: -83.9207, radiusMiles: 25 },
  { name: 'Greenville', displayName: 'Greenville, SC', slug: 'greenville', lat: 34.8526, lng: -82.3940, radiusMiles: 25 },
  { name: 'Sarasota', displayName: 'Sarasota, FL', slug: 'sarasota', lat: 27.3364, lng: -82.5307, radiusMiles: 20 },
  // Midwest
  { name: 'Chicago', displayName: 'Chicago, IL', slug: 'chicago', lat: 41.8781, lng: -87.6298, radiusMiles: 35 },
  { name: 'Detroit', displayName: 'Detroit, MI', slug: 'detroit', lat: 42.3314, lng: -83.0458, radiusMiles: 30 },
  { name: 'Minneapolis-St. Paul', displayName: 'Minneapolis-St. Paul, MN', slug: 'minneapolis', lat: 44.9778, lng: -93.2650, radiusMiles: 25 },
  { name: 'Cleveland', displayName: 'Cleveland, OH', slug: 'cleveland', lat: 41.4993, lng: -81.6944, radiusMiles: 25 },
  { name: 'Columbus', displayName: 'Columbus, OH', slug: 'columbus', lat: 39.9612, lng: -82.9988, radiusMiles: 25 },
  { name: 'Cincinnati', displayName: 'Cincinnati, OH', slug: 'cincinnati', lat: 39.1031, lng: -84.5120, radiusMiles: 25 },
  { name: 'Indianapolis', displayName: 'Indianapolis, IN', slug: 'indianapolis', lat: 39.7684, lng: -86.1581, radiusMiles: 25 },
  { name: 'Milwaukee', displayName: 'Milwaukee, WI', slug: 'milwaukee', lat: 43.0389, lng: -87.9065, radiusMiles: 25 },
  { name: 'Kansas City', displayName: 'Kansas City, MO', slug: 'kansas-city', lat: 39.0997, lng: -94.5786, radiusMiles: 30 },
  { name: 'St. Louis', displayName: 'St. Louis, MO', slug: 'st-louis', lat: 38.6270, lng: -90.1994, radiusMiles: 30 },
  { name: 'Grand Rapids', displayName: 'Grand Rapids, MI', slug: 'grand-rapids', lat: 42.9634, lng: -85.6681, radiusMiles: 25 },
  { name: 'Madison', displayName: 'Madison, WI', slug: 'madison', lat: 43.0731, lng: -89.4012, radiusMiles: 25 },
  { name: 'Des Moines', displayName: 'Des Moines, IA', slug: 'des-moines', lat: 41.5868, lng: -93.6250, radiusMiles: 25 },
  { name: 'Omaha', displayName: 'Omaha, NE', slug: 'omaha', lat: 41.2565, lng: -95.9345, radiusMiles: 25 },
  { name: 'Dayton', displayName: 'Dayton, OH', slug: 'dayton', lat: 39.7589, lng: -84.1916, radiusMiles: 20 },
  { name: 'Toledo', displayName: 'Toledo, OH', slug: 'toledo', lat: 41.6528, lng: -83.5379, radiusMiles: 20 },
  { name: 'Akron', displayName: 'Akron, OH', slug: 'akron', lat: 41.0814, lng: -81.5190, radiusMiles: 20 },
  { name: 'Wichita', displayName: 'Wichita, KS', slug: 'wichita', lat: 37.6872, lng: -97.3301, radiusMiles: 25 },
  // Southwest
  { name: 'Houston', displayName: 'Houston, TX', slug: 'houston', lat: 29.7604, lng: -95.3698, radiusMiles: 35 },
  { name: 'Dallas-Fort Worth', displayName: 'Dallas-Fort Worth, TX', slug: 'dallas-fort-worth', lat: 32.7767, lng: -96.7970, radiusMiles: 35 },
  { name: 'San Antonio', displayName: 'San Antonio, TX', slug: 'san-antonio', lat: 29.4241, lng: -98.4936, radiusMiles: 25 },
  { name: 'Austin', displayName: 'Austin, TX', slug: 'austin', lat: 30.2672, lng: -97.7431, radiusMiles: 25 },
  { name: 'El Paso', displayName: 'El Paso, TX', slug: 'el-paso', lat: 31.7619, lng: -106.4850, radiusMiles: 20 },
  { name: 'Phoenix', displayName: 'Phoenix, AZ', slug: 'phoenix', lat: 33.4484, lng: -112.0740, radiusMiles: 35 },
  { name: 'Tucson', displayName: 'Tucson, AZ', slug: 'tucson', lat: 32.2226, lng: -110.9747, radiusMiles: 25 },
  { name: 'Albuquerque', displayName: 'Albuquerque, NM', slug: 'albuquerque', lat: 35.0844, lng: -106.6504, radiusMiles: 25 },
  { name: 'Oklahoma City', displayName: 'Oklahoma City, OK', slug: 'oklahoma-city', lat: 35.4676, lng: -97.5164, radiusMiles: 25 },
  { name: 'Tulsa', displayName: 'Tulsa, OK', slug: 'tulsa', lat: 36.1540, lng: -95.9928, radiusMiles: 25 },
  { name: 'Las Vegas', displayName: 'Las Vegas, NV', slug: 'las-vegas', lat: 36.1699, lng: -115.1398, radiusMiles: 25 },
  { name: 'Little Rock', displayName: 'Little Rock, AR', slug: 'little-rock', lat: 34.7465, lng: -92.2896, radiusMiles: 25 },
  { name: 'McAllen', displayName: 'McAllen, TX', slug: 'mcallen', lat: 26.2034, lng: -98.2300, radiusMiles: 20 },
  // West
  { name: 'Los Angeles', displayName: 'Los Angeles, CA', slug: 'los-angeles', lat: 34.0522, lng: -118.2437, radiusMiles: 35 },
  { name: 'San Francisco Bay Area', displayName: 'San Francisco, CA', slug: 'san-francisco', lat: 37.7749, lng: -122.4194, radiusMiles: 35 },
  { name: 'San Diego', displayName: 'San Diego, CA', slug: 'san-diego', lat: 32.7157, lng: -117.1611, radiusMiles: 25 },
  { name: 'Sacramento', displayName: 'Sacramento, CA', slug: 'sacramento', lat: 38.5816, lng: -121.4944, radiusMiles: 25 },
  { name: 'Seattle', displayName: 'Seattle, WA', slug: 'seattle', lat: 47.6062, lng: -122.3321, radiusMiles: 30 },
  { name: 'Portland', displayName: 'Portland, OR', slug: 'portland', lat: 45.5152, lng: -122.6784, radiusMiles: 25 },
  { name: 'Denver', displayName: 'Denver, CO', slug: 'denver', lat: 39.7392, lng: -104.9903, radiusMiles: 30 },
  { name: 'Colorado Springs', displayName: 'Colorado Springs, CO', slug: 'colorado-springs', lat: 38.8339, lng: -104.8214, radiusMiles: 20 },
  { name: 'Salt Lake City', displayName: 'Salt Lake City, UT', slug: 'salt-lake-city', lat: 40.7608, lng: -111.8910, radiusMiles: 30 },
  { name: 'Boise', displayName: 'Boise, ID', slug: 'boise', lat: 43.6150, lng: -116.2023, radiusMiles: 25 },
  { name: 'Riverside-San Bernardino', displayName: 'Inland Empire, CA', slug: 'inland-empire', lat: 33.9806, lng: -117.3755, radiusMiles: 30 },
  { name: 'Fresno', displayName: 'Fresno, CA', slug: 'fresno', lat: 36.7378, lng: -119.7871, radiusMiles: 25 },
  { name: 'Bakersfield', displayName: 'Bakersfield, CA', slug: 'bakersfield', lat: 35.3733, lng: -119.0187, radiusMiles: 25 },
  { name: 'Honolulu', displayName: 'Honolulu, HI', slug: 'honolulu', lat: 21.3069, lng: -157.8583, radiusMiles: 20 },
  { name: 'Anchorage', displayName: 'Anchorage, AK', slug: 'anchorage', lat: 61.2181, lng: -149.9003, radiusMiles: 20 },
  { name: 'Reno', displayName: 'Reno, NV', slug: 'reno', lat: 39.5296, lng: -119.8138, radiusMiles: 20 },
  { name: 'Spokane', displayName: 'Spokane, WA', slug: 'spokane', lat: 47.6588, lng: -117.4260, radiusMiles: 20 },
  { name: 'Tacoma', displayName: 'Tacoma, WA', slug: 'tacoma', lat: 47.2529, lng: -122.4443, radiusMiles: 20 },
  { name: 'San Jose', displayName: 'San Jose, CA', slug: 'san-jose', lat: 37.3382, lng: -121.8863, radiusMiles: 20 },
  { name: 'Stockton', displayName: 'Stockton, CA', slug: 'stockton', lat: 37.9577, lng: -121.2908, radiusMiles: 20 },
  { name: 'Modesto', displayName: 'Modesto, CA', slug: 'modesto', lat: 37.6391, lng: -120.9969, radiusMiles: 20 },
  { name: 'Eugene', displayName: 'Eugene, OR', slug: 'eugene', lat: 44.0521, lng: -123.0868, radiusMiles: 20 },
];

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

    // 4. Score and rank — take top 3
    const scored = inRadius
      .map((l) => ({
        id: l.id,
        score: scoreListing(l, reviewCounts.get(l.id) ?? 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

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
