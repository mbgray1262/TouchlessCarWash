/**
 * Self-Serve Satisfaction Score — shared source of truth (mirrors lib/metro-scoring.ts +
 * lib/touchless-satisfaction.ts for touchless). The score itself is computed offline by
 * scripts/score-selfserve-satisfaction.mjs and stored on listings.self_service_score; this module
 * owns the FORMULA CONSTANTS and the ELIGIBILITY/RANKING rules so the scorer, the (future)
 * self-serve best-of page, and the sitemap all agree — per the SEO integrity invariant in CLAUDE.md
 * (one shared threshold, so indexed-count can never drift from what the page shows).
 *
 * Deliberately "light": internal ranking key only (no displayed gauge), no trend signal.
 */

// Bayesian shrink toward the prior mean, gated on mention count — identical to TSS so the two
// scores are directly comparable:
//   score = round( 100 * (pos + K*M) / (pos + neg + K) )   when (pos+neg) >= MIN_SELF_SERVE_MENTIONS
//   score = null                                            otherwise
export const SELF_SERVE_PRIOR_MEAN = 0.7;   // M — a self-serve wash is "fine" by default
export const SELF_SERVE_PRIOR_WEIGHT = 6;   // K — how many reviews it takes to move off the prior
export const MIN_SELF_SERVE_MENTIONS = 3;   // fewer than this → no score (not enough signal)

/** The 0-100 score from positive/negative self-serve mention counts, or null if under the gate. */
export function computeSelfServeScore(pos: number, neg: number): number | null {
  const mentions = pos + neg;
  if (mentions < MIN_SELF_SERVE_MENTIONS) return null;
  return Math.round((100 * (pos + SELF_SERVE_PRIOR_WEIGHT * SELF_SERVE_PRIOR_MEAN)) / (mentions + SELF_SERVE_PRIOR_WEIGHT));
}

// Best-of eligibility — a wash may anchor a "Best Self-Service Car Washes in [metro]" page only if
// it has a score AND is credible on Google (mirrors touchless MIN_TROPHY_RATING/REVIEWS so a high
// score next to 2 Google reviews can't crown a thin listing).
export const MIN_SELF_SERVE_TROPHY_RATING = 4.0;
export const MIN_SELF_SERVE_TROPHY_REVIEWS = 20;

export function selfServeTrophyEligible(listing: {
  self_service_score?: number | null;
  rating?: number | null;
  review_count?: number | null;
}): boolean {
  return (
    listing.self_service_score != null &&
    (listing.rating ?? 0) >= MIN_SELF_SERVE_TROPHY_RATING &&
    (listing.review_count ?? 0) >= MIN_SELF_SERVE_TROPHY_REVIEWS
  );
}

/**
 * Ranking key for a self-serve best-of list. Scored washes rank by score; unscored-but-credible
 * washes fall back to a capped Google-rating term so they sit BELOW comparable scored washes but a
 * metro with few scored washes can still field a top list (parallel to the touchless composite).
 */
export function selfServeRankKey(listing: {
  self_service_score?: number | null;
  rating?: number | null;
  review_count?: number | null;
}): number {
  if (listing.self_service_score != null) return listing.self_service_score;
  // Fallback: map a 0-5 Google rating into a sub-score band (max ~55) so it never outranks a real
  // scored wash, and only counts when there are enough reviews to be credible.
  if ((listing.review_count ?? 0) >= MIN_SELF_SERVE_TROPHY_REVIEWS && (listing.rating ?? 0) > 0) {
    return Math.min(55, Math.round((listing.rating as number) * 11));
  }
  return 0;
}
