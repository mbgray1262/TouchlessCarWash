/**
 * Single source of truth for "what image does this listing actually display?"
 *
 * Listings have several image SOURCES (a curated hero_image, a Google photo, a
 * street view, and — for chain locations — a brand image computed from
 * parent_chain). The pages don't store the final choice; they pick the best
 * available in a fallback order. Historically that fallback was re-implemented
 * in ListingCard, the detail page, AND the completeness checks, which drifted
 * apart and caused "missing image" false positives. Everything now routes
 * through getDisplayImage so they can't disagree.
 *
 * NOTE: the SQL function listing_completeness_stats()/completeness_rows() mirror
 * hasDisplayImage() (it can't import this TS). They approximate the chain brand
 * image with `parent_chain IS NOT NULL`. Keep them in sync with this file.
 */

import { getChainBrandImage } from './chain-brand-images';

// Hero sources a human (or our curated AI pass) explicitly chose. A real
// location photo always beats the generic chain brand image.
const HUMAN_HERO_SOURCES = new Set([
  'manual', 'gallery', 'upload', 'crop', 'paste',
  'text-verified-pick', 'google-ai', 'streetview-ai',
]);

export interface ListingImageFields {
  id: string;
  parent_chain?: string | null;
  hero_image?: string | null;
  hero_image_source?: string | null;
  google_photo_url?: string | null;
  street_view_url?: string | null;
}

/**
 * The image a listing displays, following the fallback chain:
 *   chain brand image → hero_image → google_photo_url → street_view_url
 *
 * @param opts.allowStreetView  Set false on browse cards (street view URLs often
 *   403 and look broken at small sizes); detail pages allow it.
 */
export function getDisplayImage(
  l: ListingImageFields,
  opts: { allowStreetView?: boolean } = {},
): string | null {
  const allowStreetView = opts.allowStreetView ?? true;
  const isHumanHero = l.hero_image_source ? HUMAN_HERO_SOURCES.has(l.hero_image_source) : false;
  const chainBrandImage = !isHumanHero ? getChainBrandImage(l.parent_chain ?? null, l.id) : null;
  return (
    chainBrandImage ??
    l.hero_image ??
    l.google_photo_url ??
    (allowStreetView ? l.street_view_url ?? null : null) ??
    null
  );
}

/** True when the listing shows ANY image to visitors (after all fallbacks). */
export function hasDisplayImage(l: ListingImageFields): boolean {
  return getDisplayImage(l, { allowStreetView: true }) != null;
}
