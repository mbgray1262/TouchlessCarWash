/**
 * Listing quality helpers — determine whether a touchless listing is "thin"
 * and should be excluded from the search index.
 *
 * A listing is considered thin when:
 *   - It has no source we can pull unique content from:
 *       - no crawl_snapshot (we never successfully crawled the site), AND
 *       - no extracted_data (no structured facts we could ground a description in)
 *   - AND it does not have a strong user-review signal that would justify keeping
 *     the page indexed purely on review trust:
 *       - rating >= 4.0 AND review_count >= 20
 *     (listings that meet the review floor stay indexed even without crawl data,
 *     because Google treats user review volume as a legitimate trust signal.)
 *
 * Thin listings are still shown on city/state hub pages — this helper only
 * affects whether the individual listing detail page appears in Google search
 * results. Hub pages continue to link to them, so the user-visible directory
 * comprehensiveness is unchanged.
 *
 * The goal is to stop advertising a large tail of low-content listing pages
 * to Google, which hurts the site-wide quality signal and has been contributing
 * to repeated AdSense application rejections.
 */

export const REVIEW_FLOOR_COUNT = 20;
export const REVIEW_FLOOR_RATING = 4.0;

export type ListingQualityFields = {
  crawl_snapshot?: unknown | null;
  extracted_data?: unknown | null;
  rating?: number | null;
  review_count?: number | null;
  is_claimed?: boolean | null;
  is_featured?: boolean | null;
};

/**
 * Returns true if this listing should be noindexed due to thin content.
 * See file-level doc for the full criteria.
 */
export function isThinListing(listing: ListingQualityFields): boolean {
  // Keep indexed if it's manually claimed or editorially featured — these
  // are curated signals that override automatic quality checks.
  if (listing.is_claimed || listing.is_featured) return false;

  // Keep indexed if it has any source of real content.
  const hasContent =
    listing.crawl_snapshot != null || listing.extracted_data != null;
  if (hasContent) return false;

  // No content — keep indexed only if review signal is strong enough.
  const rating = listing.rating ?? 0;
  const reviewCount = listing.review_count ?? 0;
  const meetsReviewFloor =
    rating >= REVIEW_FLOOR_RATING && reviewCount >= REVIEW_FLOOR_COUNT;

  return !meetsReviewFloor;
}
