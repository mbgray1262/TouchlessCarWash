/**
 * Listing quality helpers — determine whether a touchless listing is "thin"
 * and should be excluded from the search index.
 *
 * A listing is considered thin ONLY when it has no evidence of real operation:
 *   - no crawl_snapshot (we never successfully crawled the site), AND
 *   - no extracted_data (no structured facts), AND
 *   - zero Google reviews (no user evidence the business even operates).
 *
 * Rating is intentionally NOT a filter. This is a comprehensive directory,
 * not a curated best-of — a 3.2-star car wash with 150 reviews is still a
 * real business people want to find, and the reviews themselves are content.
 * We only hide the true "ghost" listings that have nothing.
 *
 * Thin listings are still shown on city/state hub pages — this helper only
 * affects whether the individual listing detail page appears in Google search
 * results.
 */

export const REVIEW_FLOOR_COUNT = 1;  // ≥1 review = proof of real operation
export const REVIEW_FLOOR_RATING = 0; // no rating requirement (kept for export-compat)

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

  // No content — keep indexed if it has at least 1 Google review.
  // Any review is proof the business exists and has customers.
  const reviewCount = listing.review_count ?? 0;
  return reviewCount < REVIEW_FLOOR_COUNT;
}
