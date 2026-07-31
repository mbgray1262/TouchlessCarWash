/**
 * Hand-Wash Satisfaction Score — shared source of truth (mirrors lib/self-serve-scoring.ts +
 * lib/metro-scoring.ts / lib/touchless-satisfaction.ts). The score is computed offline by
 * scripts/score-handwash-satisfaction.mjs and stored on listings.hand_wash_score; this module
 * owns the FORMULA CONSTANTS and the ELIGIBILITY/RANKING rules so the scorer, the (future)
 * hand-wash best-of page, and the sitemap all agree — per the SEO integrity invariant in CLAUDE.md
 * (one shared threshold, so indexed-count can never drift from what the page shows).
 */

// Bayesian shrink toward the prior mean, gated on mention count — identical to TSS + the
// self-serve score so the three are directly comparable:
//   score = round( 100 * (pos + K*M) / (pos + neg + K) )   when (pos+neg) >= MIN_HAND_WASH_MENTIONS
//   score = null                                            otherwise
export const HAND_WASH_PRIOR_MEAN = 0.7;   // M — a hand wash is "fine" by default
export const HAND_WASH_PRIOR_WEIGHT = 6;   // K — how many reviews it takes to move off the prior
export const MIN_HAND_WASH_MENTIONS = 3;   // fewer than this → no score (not enough signal)

/** The 0-100 score from positive/negative hand-wash mention counts, or null if under the gate. */
export function computeHandWashScore(pos: number, neg: number): number | null {
  const mentions = pos + neg;
  if (mentions < MIN_HAND_WASH_MENTIONS) return null;
  return Math.round((100 * (pos + HAND_WASH_PRIOR_WEIGHT * HAND_WASH_PRIOR_MEAN)) / (mentions + HAND_WASH_PRIOR_WEIGHT));
}

// Best-of eligibility — a wash may anchor a "Best Hand Car Washes in [metro]" page only if it has
// a score AND is credible on Google (mirrors the touchless / self-serve trophy gates so a high
// score next to 2 Google reviews can't crown a thin listing).
export const MIN_HAND_WASH_TROPHY_RATING = 4.0;
export const MIN_HAND_WASH_TROPHY_REVIEWS = 20;

export function handWashTrophyEligible(listing: {
  hand_wash_score?: number | null;
  rating?: number | null;
  review_count?: number | null;
}): boolean {
  return (
    listing.hand_wash_score != null &&
    (listing.rating ?? 0) >= MIN_HAND_WASH_TROPHY_RATING &&
    (listing.review_count ?? 0) >= MIN_HAND_WASH_TROPHY_REVIEWS
  );
}

/**
 * Ranking key for a hand-wash best-of list. Scored washes rank by score; unscored-but-credible
 * washes fall back to a capped Google-rating term so they sit BELOW comparable scored washes but a
 * metro with few scored washes can still field a top list (parallel to touchless / self-serve).
 */
export function handWashRankKey(listing: {
  hand_wash_score?: number | null;
  rating?: number | null;
  review_count?: number | null;
}): number {
  if (listing.hand_wash_score != null) return listing.hand_wash_score;
  if ((listing.review_count ?? 0) >= MIN_HAND_WASH_TROPHY_REVIEWS && (listing.rating ?? 0) > 0) {
    return Math.min(55, Math.round((listing.rating as number) * 11));
  }
  return 0;
}
