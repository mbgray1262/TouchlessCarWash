/**
 * Shared metro-area queries for DETAILING best-of pages — the detailing twin of
 * lib/hand-wash-metro.ts. Both the detailing best-of page (/best-detailing/[slug]) and the
 * sitemap import getQualifyingDetailingMetros(), so the set of pages emitted always equals the
 * set that renders 200 (the SEO integrity invariant in CLAUDE.md — no indexed-count drift).
 */
import { cache } from 'react';
import { type Listing } from '@/lib/supabase';
import { publicDetailingListings } from '@/lib/detailing';
import { METRO_AREAS, boundingBox, haversineDistance, type MetroArea } from '@/lib/metro-areas';
import { detailingTrophyEligible } from '@/lib/detailing-scoring';

// Columns needed to rank + render a detailing best-of card.
export const DETAILING_BEST_COLUMNS =
  'id, name, slug, city, state, address, phone, website, rating, review_count, hero_image, google_photo_url, street_view_url, logo_photo, google_logo_url, amenities, extracted_data, hours, is_touchless, is_self_service, is_hand_wash, is_detailing, is_approved, detailing_reviewed_at, latitude, longitude, detailing_score';

/** All public detailing listings within a metro's radius (the canonical "what's in this metro"). */
export const getDetailingMetroListings = cache(async (metro: MetroArea): Promise<Listing[]> => {
  const box = boundingBox(metro.lat, metro.lng, metro.radiusMiles);
  const { data, error } = await publicDetailingListings(DETAILING_BEST_COLUMNS)
    .gte('latitude', box.minLat)
    .lte('latitude', box.maxLat)
    .gte('longitude', box.minLng)
    .lte('longitude', box.maxLng)
    .order('detailing_score', { ascending: false, nullsFirst: false })
    .limit(1000);
  if (error || !data) return [];
  return (data as Listing[]).filter((l) => {
    if (l.latitude == null || l.longitude == null) return false;
    return haversineDistance(metro.lat, metro.lng, l.latitude, l.longitude) <= metro.radiusMiles;
  });
});

export type DetailingMetroWithCount = MetroArea & { listingCount: number };

/**
 * Metros that qualify for a detailing best-of page: >=5 public detailers in the radius AND at
 * least one that's best-of-eligible (scored + credible on Google). Same gate as touchless /
 * hand-wash / self-serve so the page and the sitemap stay in lockstep.
 */
type QMDetailing = {
  id: string; latitude: number | null; longitude: number | null;
  rating: number | null; review_count: number | null; detailing_score: number | null;
};

export async function getQualifyingDetailingMetros(): Promise<DetailingMetroWithCount[]> {
  const PAGE = 1000;
  const all: QMDetailing[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await publicDetailingListings('id, latitude, longitude, rating, review_count, detailing_score')
      .not('latitude', 'is', null).not('longitude', 'is', null)
      .order('id').range(offset, offset + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as QMDetailing[]));
    if (data.length < PAGE) break;
  }

  const results: DetailingMetroWithCount[] = [];
  for (const metro of METRO_AREAS) {
    const box = boundingBox(metro.lat, metro.lng, metro.radiusMiles);
    let count = 0, eligible = 0;
    for (const l of all) {
      if (l.latitude == null || l.longitude == null) continue;
      if (l.latitude >= box.minLat && l.latitude <= box.maxLat && l.longitude >= box.minLng && l.longitude <= box.maxLng
        && haversineDistance(metro.lat, metro.lng, l.latitude, l.longitude) <= metro.radiusMiles) {
        count++;
        if (detailingTrophyEligible(l)) eligible++;
      }
    }
    if (count >= 5 && eligible >= 1) results.push({ ...metro, listingCount: count });
  }
  return results;
}
