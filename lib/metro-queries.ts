/**
 * Shared metro-area listing queries.
 *
 * Both the metro Best-Of page (/best/[slug]) and the State page (/state/[state])
 * need to know how many verified touchless washes fall inside a metro's radius.
 * Keeping the logic in one place guarantees the counts match everywhere — this
 * is what prevents the "61 here, 6 there" inconsistency between pages.
 */
import { cache } from 'react';
import { supabase, type Listing } from '@/lib/supabase';
import { boundingBox, haversineDistance, type MetroArea } from '@/lib/metro-areas';
import { isDislikedTouchless } from '@/lib/touchless-quality';

// Columns needed for scoring + display on the Best-Of page.
export const BEST_OF_COLUMNS =
  'id, name, slug, city, state, address, phone, website, rating, review_count, hero_image, google_photo_url, street_view_url, logo_photo, google_logo_url, amenities, touchless_wash_types, extracted_data, hours, is_touchless, is_featured, latitude, longitude, touchless_sentiment';

/**
 * Returns the set of listing IDs whose touchless reviews are predominantly
 * negative, so we never recommend a wash customers specifically dislike.
 */
export async function getDislikedTouchlessIds(listingIds: string[]): Promise<Set<string>> {
  const disliked = new Set<string>();
  if (listingIds.length === 0) return disliked;

  const tally = new Map<string, { pos: number; neg: number }>();
  // Paginate to dodge Supabase's silent 1000-row SELECT cap on large metros.
  for (let offset = 0; ; offset += 1000) {
    const { data } = await supabase
      .from('review_snippets')
      .select('listing_id, sentiment')
      .in('listing_id', listingIds)
      .eq('is_touchless_evidence', true)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data as { listing_id: string; sentiment: string }[]) {
      const t = tally.get(r.listing_id) ?? { pos: 0, neg: 0 };
      if (r.sentiment === 'positive') t.pos++;
      else if (r.sentiment === 'negative') t.neg++;
      tally.set(r.listing_id, t);
    }
    if (data.length < 1000) break;
  }

  for (const [id, t] of Array.from(tally)) {
    if (isDislikedTouchless(t.pos, t.neg)) disliked.add(id);
  }
  return disliked;
}

/**
 * All approved, verified-touchless listings within a metro's radius, with
 * predominantly-disliked washes removed. This is the canonical "what's in
 * this metro" query — the number both pages display.
 */
export const getMetroListings = cache(async (metro: MetroArea): Promise<Listing[]> => {
  const box = boundingBox(metro.lat, metro.lng, metro.radiusMiles);

  const { data, error } = await supabase
    .from('listings')
    .select(BEST_OF_COLUMNS)
    .eq('is_touchless', true)
    .eq('is_approved', true)
    .gte('latitude', box.minLat)
    .lte('latitude', box.maxLat)
    .gte('longitude', box.minLng)
    .lte('longitude', box.maxLng)
    .order('rating', { ascending: false })
    .limit(1000);

  if (error || !data) return [];

  // Filter to precise radius using haversine
  const inRadius = (data as Listing[]).filter((listing) => {
    if (listing.latitude == null || listing.longitude == null) return false;
    const dist = haversineDistance(metro.lat, metro.lng, listing.latitude, listing.longitude);
    return dist <= metro.radiusMiles;
  });

  // Drop washes whose touchless reviews are predominantly negative.
  const disliked = await getDislikedTouchlessIds(inRadius.map((l) => l.id));
  return inRadius.filter((l) => !disliked.has(l.id));
});

/** Lightweight count of washes in a metro radius (uses the cached query). */
export async function getMetroListingCount(metro: MetroArea): Promise<number> {
  const listings = await getMetroListings(metro);
  return listings.length;
}
