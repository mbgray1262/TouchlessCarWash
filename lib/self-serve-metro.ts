/**
 * Shared metro-area queries for SELF-SERVE best-of pages — the self-serve twin of
 * lib/metro-queries.ts. Both the self-serve best-of page (/best-self-serve/[slug]) and the
 * sitemap import getQualifyingSelfServeMetros(), so the set of pages emitted always equals the
 * set that renders 200 (the SEO integrity invariant in CLAUDE.md — no indexed-count drift).
 */
import { cache } from 'react';
import { type Listing } from '@/lib/supabase';
import { publicSelfServeListings } from '@/lib/self-serve';
import { METRO_AREAS, boundingBox, haversineDistance, type MetroArea } from '@/lib/metro-areas';
import { selfServeTrophyEligible } from '@/lib/self-serve-scoring';

// Columns needed to rank + render a self-serve best-of card.
export const SELF_SERVE_BEST_COLUMNS =
  'id, name, slug, city, state, address, phone, website, rating, review_count, hero_image, google_photo_url, street_view_url, logo_photo, google_logo_url, amenities, extracted_data, hours, is_touchless, is_self_service, is_approved, self_service_reviewed_at, latitude, longitude, self_service_score';

/** All public self-serve listings within a metro's radius (the canonical "what's in this metro"). */
export const getSelfServeMetroListings = cache(async (metro: MetroArea): Promise<Listing[]> => {
  const box = boundingBox(metro.lat, metro.lng, metro.radiusMiles);
  const { data, error } = await publicSelfServeListings(SELF_SERVE_BEST_COLUMNS)
    .gte('latitude', box.minLat)
    .lte('latitude', box.maxLat)
    .gte('longitude', box.minLng)
    .lte('longitude', box.maxLng)
    .order('self_service_score', { ascending: false, nullsFirst: false })
    .limit(1000);
  if (error || !data) return [];
  return (data as Listing[]).filter((l) => {
    if (l.latitude == null || l.longitude == null) return false;
    return haversineDistance(metro.lat, metro.lng, l.latitude, l.longitude) <= metro.radiusMiles;
  });
});

export type SelfServeMetroWithCount = MetroArea & { listingCount: number };

/**
 * Metros that qualify for a self-serve best-of page: >=5 public self-serve washes in the radius
 * AND at least one that's best-of-eligible (scored + credible on Google). Same gate as the
 * touchless getQualifyingMetros so the page and the sitemap stay in lockstep.
 */
type QMSelfServe = {
  id: string; latitude: number | null; longitude: number | null;
  rating: number | null; review_count: number | null; self_service_score: number | null;
};

export async function getQualifyingSelfServeMetros(): Promise<SelfServeMetroWithCount[]> {
  const PAGE = 1000;
  const all: QMSelfServe[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await publicSelfServeListings('id, latitude, longitude, rating, review_count, self_service_score')
      .not('latitude', 'is', null).not('longitude', 'is', null)
      .order('id').range(offset, offset + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as QMSelfServe[]));
    if (data.length < PAGE) break;
  }

  const results: SelfServeMetroWithCount[] = [];
  for (const metro of METRO_AREAS) {
    const box = boundingBox(metro.lat, metro.lng, metro.radiusMiles);
    let count = 0, eligible = 0;
    for (const l of all) {
      if (l.latitude == null || l.longitude == null) continue;
      if (l.latitude >= box.minLat && l.latitude <= box.maxLat && l.longitude >= box.minLng && l.longitude <= box.maxLng
        && haversineDistance(metro.lat, metro.lng, l.latitude, l.longitude) <= metro.radiusMiles) {
        count++;
        if (selfServeTrophyEligible(l)) eligible++;
      }
    }
    if (count >= 5 && eligible >= 1) results.push({ ...metro, listingCount: count });
  }
  return results;
}
