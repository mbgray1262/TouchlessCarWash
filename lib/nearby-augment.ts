/**
 * "In or Near" city-page augmentation.
 *
 * Many of our city pages have only one in-city listing, which Google's
 * thin-content heuristic flags as soft-404 / not-worth-indexing. To make
 * these pages genuinely useful (and indexable) we augment them with
 * touchless car washes in nearby cities — a real driver searching for a
 * touchless wash in a small town wants nearby alternatives anyway.
 *
 * The functions in this module are pure helpers; the state-wide listing
 * fetch and rendering live in app/state/[state]/[city]/page.tsx and
 * app/sitemap.xml/route.ts so they share a single per-request cache.
 */
import { cache } from 'react';
import { supabase, LISTING_CARD_COLUMNS, type Listing } from './supabase';
import { haversineDistance } from './metro-areas';

export const NEARBY_RADIUS_MILES = 25;
export const NEARBY_LIMIT = 8;
export const INDEXABLE_MIN_EFFECTIVE = 3;

export type Anchor = { lat: number; lng: number };

export type NearbyCandidate = Pick<Listing, 'latitude' | 'longitude' | 'city'>;

/**
 * Pick a representative anchor point for a city from its in-city listings.
 * Returns the first listing with valid coordinates. Most listings have
 * coords; if none do, callers fall back to skipping augmentation.
 */
export function pickAnchorFromListings(listings: NearbyCandidate[]): Anchor | null {
  for (const l of listings) {
    if (l.latitude != null && l.longitude != null) {
      return { lat: Number(l.latitude), lng: Number(l.longitude) };
    }
  }
  return null;
}

/**
 * Filter an in-memory candidate set to listings within `radiusMiles` of
 * `anchor`, excluding the origin city and any listings already shown.
 * Returns up to `limit` results, sorted nearest-first, with a synthetic
 * `_distance` (miles) field attached for UI labeling.
 */
export function selectNearby<T extends NearbyCandidate & { id: string }>(
  candidates: T[],
  anchor: Anchor,
  excludeCityName: string,
  excludeListingIds: Set<string>,
  radiusMiles: number = NEARBY_RADIUS_MILES,
  limit: number = NEARBY_LIMIT,
): Array<T & { _distance: number }> {
  const exCity = excludeCityName.toLowerCase().trim();
  const out: Array<T & { _distance: number }> = [];
  for (const c of candidates) {
    if (c.latitude == null || c.longitude == null) continue;
    if (excludeListingIds.has(c.id)) continue;
    if (c.city.toLowerCase().trim() === exCity) continue;
    const d = haversineDistance(anchor.lat, anchor.lng, Number(c.latitude), Number(c.longitude));
    if (d <= radiusMiles) {
      out.push({ ...c, _distance: d });
    }
  }
  out.sort((a, b) => a._distance - b._distance);
  return out.slice(0, limit);
}

/**
 * Per-request cached fetch of all approved touchless listings in a state
 * with the columns needed to render listing cards plus lat/lng for the
 * distance filter. Uses LISTING_CARD_COLUMNS + lat/lng so nearby cards
 * render identically to in-city cards.
 *
 * Capped at 2000 rows — the largest state (TX) has ~3000 touchless
 * listings, so this caps at the most common metro radius without
 * paging through everything.
 */
export const getStateListingsForAugment = cache(
  async (stateCode: string): Promise<Array<Listing & { latitude: number | null; longitude: number | null }>> => {
    const { data } = await supabase
      .from('listings')
      .select(`${LISTING_CARD_COLUMNS}, latitude, longitude`)
      .eq('is_touchless', true)
      .eq('is_approved', true)
      .eq('state', stateCode)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(2000);
    return (data as Array<Listing & { latitude: number | null; longitude: number | null }>) ?? [];
  },
);
