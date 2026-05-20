/**
 * Listing quality helpers — determine whether a touchless listing is "thin"
 * and should be excluded from the search index.
 *
 * Two categories get noindexed:
 *
 * 1. TRUE GHOST LISTINGS — no evidence the business even operates:
 *      - no crawl_snapshot, AND
 *      - no extracted_data, AND
 *      - zero Google reviews.
 *
 * 2. SCALED-DUPLICATE CHAIN LOCATIONS — a listing that IS part of a chain
 *    (parent_chain set) but has no unique per-location signals that could
 *    differentiate it from other locations of the same chain. Without those
 *    signals, any AI description we generate would necessarily lean on the
 *    shared corporate-website markdown, producing near-duplicate content
 *    across hundreds of listings — the "scaled content abuse" pattern
 *    Google's quality systems flag and which AdSense reviewers reject.
 *    A chain listing is considered scaled-duplicate when ALL of:
 *      - parent_chain is non-null, AND
 *      - review_snippet_count < 2 (fewer than 2 customer reviews to quote), AND
 *      - google_description is null/empty (no Google-provided unique blurb).
 *    Hours alone don't save it — many chains have identical "24/7" defaults.
 *
 * Either category can be overridden by the is_claimed or is_featured flags.
 *
 * Rating is intentionally NOT a filter. Low-rated businesses are still real
 * businesses searchers want to find, and reviews are themselves content.
 *
 * Thin listings are still shown on city/state hub pages — this helper only
 * affects whether the individual listing detail page appears in search
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
  parent_chain?: string | null;
  google_description?: string | null;
  /**
   * Count of TOUCHLESS-EVIDENCE review_snippets rows for this listing. Not
   * stored on the listings row itself — callers (detail page, sitemap)
   * must provide it. The classifier (lib/touchless-classifier patterns)
   * already filters out reviews that DENY the touchless claim ("not
   * touchless", "claims touchless but", "brushes came down"), so any
   * snippet with is_touchless_evidence=true is a customer confirming
   * the wash IS touchless — regardless of star rating.
   *
   * When omitted, chain listings get the benefit of the doubt (assumed
   * to have snippets).
   */
  review_snippet_count?: number;
};

/**
 * Returns true if this listing should be noindexed due to thin content.
 * See file-level doc for the full criteria.
 */
export function isThinListing(listing: ListingQualityFields): boolean {
  // Manual overrides — curated signals always win.
  if (listing.is_claimed || listing.is_featured) return false;

  // Category 2: scaled-duplicate chain location. Checked FIRST because a
  // chain listing might well have crawl_snapshot populated (with corporate
  // markdown) — we still want to noindex if it has no per-location signals.
  // Unlocks on EITHER a Google blurb OR ≥1 touchless-evidence review.
  // Goal: include every touchless car wash in the directory, including
  // ones with mixed customer feedback. A single confirmation review is
  // unique per-location content that differentiates from the corporate
  // boilerplate every other chain location shares.
  if (listing.parent_chain) {
    const snippetCount = listing.review_snippet_count ?? Infinity;
    const hasGoogleBlurb = !!(listing.google_description && listing.google_description.trim().length > 0);
    if (snippetCount < 1 && !hasGoogleBlurb) return true;
  }

  // Category 1: true ghost listing. Has any content source → index.
  const hasContent =
    listing.crawl_snapshot != null || listing.extracted_data != null;
  if (hasContent) return false;

  // No content — keep indexed if it has at least 1 Google review.
  const reviewCount = listing.review_count ?? 0;
  return reviewCount < REVIEW_FLOOR_COUNT;
}
