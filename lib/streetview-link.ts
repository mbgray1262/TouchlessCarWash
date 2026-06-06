/**
 * Build a "Street View" URL that won't drop the visitor inside a random
 * adjacent business.
 *
 * Why: Google Street View URLs of the form
 *   https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=LAT,LNG
 * pick the geographically closest panorama, INCLUDING user-uploaded 360°
 * photo spheres of business interiors (most commonly from third-party
 * uploaders like "American Marketing & Publishing"). For small-town
 * locations where Google's own Street View truck hasn't driven the
 * adjacent street, the closest pano is often inside a neighboring
 * retail store — which makes the "Street View" button feel broken.
 *
 * Filtering with `source=outdoor` is not enough: AM&P-style uploads are
 * tagged outdoor by Google. The reliable signal is the `copyright`
 * field — Google's own Street View imagery is "© Google", anything
 * else is a third-party upload we don't want to deep-link into.
 *
 * Strategy:
 *   1. Hit the Street View metadata API for the listing's coords.
 *   2. If the closest pano is Google's own (copyright contains "Google"),
 *      return a URL pinned to that exact pano_id.
 *   3. Otherwise, fall back to the listing's Google Maps place page
 *      (using place_id when available, address search as a last resort)
 *      — that lands the user somewhere useful (photos, reviews, hours)
 *      instead of inside a stranger's 360° tour of a hardware store.
 *
 * Cached via React's per-request `cache()` so the metadata fetch only
 * fires once per listing render even though we call it from both the
 * page body and (if added later) JSON-LD structured data.
 */
import { cache } from 'react';

const METADATA_BASE = 'https://maps.googleapis.com/maps/api/streetview/metadata';

interface MetadataResponse {
  status: 'OK' | 'ZERO_RESULTS' | 'NOT_FOUND' | string;
  pano_id?: string;
  copyright?: string;
  date?: string;
  location?: { lat: number; lng: number };
}

async function fetchMetadata(lat: number, lng: number): Promise<MetadataResponse | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  // radius=100m keeps the search tight to the actual business — wider radii
  // increase the chance of grabbing a pano from across the street or next door.
  const url = `${METADATA_BASE}?location=${lat},${lng}&source=outdoor&radius=100&key=${key}`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } }); // 24h cache
    if (!res.ok) return null;
    return (await res.json()) as MetadataResponse;
  } catch {
    return null;
  }
}

/**
 * Returns a Street View URL safe for direct linking, or null if no
 * usable Google-official pano exists at that location. Caller is
 * responsible for the fallback (typically the place-page URL).
 */
export const getOfficialStreetViewUrl = cache(
  async (lat: number | null | undefined, lng: number | null | undefined): Promise<string | null> => {
    if (lat == null || lng == null) return null;
    const meta = await fetchMetadata(Number(lat), Number(lng));
    if (!meta || meta.status !== 'OK' || !meta.pano_id) return null;
    // Only Google's own Street View imagery — third-party uploads (AM&P et al)
    // surface 360° interiors of adjacent businesses and break the UX.
    const copyright = meta.copyright || '';
    if (!/google/i.test(copyright)) return null;
    // Pin to the specific pano_id so Google doesn't re-pick a closer
    // (worse) pano on the next visit.
    return `https://www.google.com/maps/@?api=1&map_action=pano&pano=${encodeURIComponent(meta.pano_id)}`;
  },
);

/**
 * Build a "View on Google Maps" fallback URL — lands on the place's
 * dedicated listing page (with photos / reviews / Street View tab the
 * user can browse manually) rather than dropping straight into a pano.
 */
export function buildPlacePageUrl(opts: {
  placeId?: string | null;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  // Build a human-readable query label (also the fallback when there's no
  // place_id). Including the business name disambiguates co-located
  // businesses — e.g. a Grease Monkey sharing an address with the car wash.
  const q = [opts.name, opts.address, opts.city, opts.state, opts.zip]
    .filter(Boolean)
    .join(', ');
  const query = encodeURIComponent(q || opts.name || 'car wash');

  // When we know the exact place_id, use Google's official Maps URL API with
  // `query_place_id`. This PINS the result to that specific place rather than
  // running a fuzzy search — critical at shared addresses, where the old
  // `?q=place_id:…` form (Google treats `q` as a search term) would surface
  // the more prominent neighbor's panel and photos instead of this listing.
  if (opts.placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(opts.placeId)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
