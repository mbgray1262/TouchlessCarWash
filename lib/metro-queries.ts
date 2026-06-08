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
import { METRO_AREAS, boundingBox, haversineDistance, type MetroArea } from '@/lib/metro-areas';
import { isDislikedTouchless } from '@/lib/touchless-quality';

// Columns needed for scoring + display on the Best-Of page.
export const BEST_OF_COLUMNS =
  'id, name, slug, city, state, address, phone, website, rating, review_count, hero_image, google_photo_url, street_view_url, logo_photo, google_logo_url, amenities, touchless_wash_types, extracted_data, hours, is_touchless, is_featured, latitude, longitude, touchless_sentiment, touchless_satisfaction_score, paint_safe_verified, paint_score';

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

export type MetroWithCount = MetroArea & { listingCount: number };

/**
 * Metros that qualify for a /best card: 5+ verified-touchless listings within
 * the metro radius, after removing predominantly-disliked washes. Bulk
 * implementation (one listings fetch + in-memory geo loop) shared by the /best
 * index page AND the admin "Best Of Metros" stat, so the dashboard number
 * always equals the number of cards rendered on /best.
 */
export async function getQualifyingMetros(): Promise<MetroWithCount[]> {
  const PAGE_SIZE = 1000;
  const allListings: { id: string; latitude: number; longitude: number }[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('listings')
      .select('id, latitude, longitude')
      .eq('is_touchless', true)
      .eq('is_approved', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    allListings.push(...(data as { id: string; latitude: number; longitude: number }[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Exclude washes whose touchless reviews are predominantly negative (same
  // rule as the metro pages) so the threshold agrees with what's shown.
  const tally = new Map<string, { pos: number; neg: number }>();
  for (let o = 0; ; o += PAGE_SIZE) {
    const { data } = await supabase
      .from('review_snippets')
      .select('listing_id, sentiment')
      .eq('is_touchless_evidence', true)
      .range(o, o + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const r of data as { listing_id: string; sentiment: string }[]) {
      const t = tally.get(r.listing_id) ?? { pos: 0, neg: 0 };
      if (r.sentiment === 'positive') t.pos++;
      else if (r.sentiment === 'negative') t.neg++;
      tally.set(r.listing_id, t);
    }
    if (data.length < PAGE_SIZE) break;
  }
  const disliked = new Set<string>();
  for (const [id, t] of Array.from(tally)) {
    if (isDislikedTouchless(t.pos, t.neg)) disliked.add(id);
  }

  const listings = allListings.filter((l) => !disliked.has(l.id));

  const results: MetroWithCount[] = [];
  for (const metro of METRO_AREAS) {
    const box = boundingBox(metro.lat, metro.lng, metro.radiusMiles);
    let count = 0;
    for (const listing of listings) {
      if (
        listing.latitude >= box.minLat &&
        listing.latitude <= box.maxLat &&
        listing.longitude >= box.minLng &&
        listing.longitude <= box.maxLng
      ) {
        const dist = haversineDistance(metro.lat, metro.lng, listing.latitude, listing.longitude);
        if (dist <= metro.radiusMiles) count++;
      }
    }
    if (count >= 5) results.push({ ...metro, listingCount: count });
  }
  return results;
}

/**
 * Count of metros that qualify for a /best card. The admin stats page uses this
 * so "Best Of Metros" always equals the number of cards shown on /best.
 */
export async function getQualifyingMetroCount(): Promise<number> {
  return (await getQualifyingMetros()).length;
}
