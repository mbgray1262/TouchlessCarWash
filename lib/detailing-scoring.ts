/**
 * Detailing Satisfaction Score — shared source of truth (mirrors lib/hand-wash-scoring.ts +
 * lib/self-serve-scoring.ts + lib/metro-scoring.ts / lib/touchless-satisfaction.ts). The score is
 * computed offline by scripts/score-detailing-satisfaction.mjs and stored on
 * listings.detailing_score; this module owns the FORMULA CONSTANTS and the ELIGIBILITY/RANKING
 * rules so the scorer, the detailing best-of page, and the sitemap all agree — per the SEO
 * integrity invariant in CLAUDE.md (one shared threshold, so indexed-count can never drift from
 * what the page shows).
 */

// Bayesian shrink toward the prior mean, gated on mention count — identical to TSS + the hand-wash
// / self-serve scores so all four are directly comparable:
//   score = round( 100 * (pos + K*M) / (pos + neg + K) )   when (pos+neg) >= MIN_DETAILING_MENTIONS
//   score = null                                            otherwise
export const DETAILING_PRIOR_MEAN = 0.7;   // M — a detail job is "fine" by default
export const DETAILING_PRIOR_WEIGHT = 6;   // K — how many reviews it takes to move off the prior
export const MIN_DETAILING_MENTIONS = 3;   // fewer than this → no score (not enough signal)

/** The 0-100 score from positive/negative detailing mention counts, or null if under the gate. */
export function computeDetailingScore(pos: number, neg: number): number | null {
  const mentions = pos + neg;
  if (mentions < MIN_DETAILING_MENTIONS) return null;
  return Math.round((100 * (pos + DETAILING_PRIOR_WEIGHT * DETAILING_PRIOR_MEAN)) / (mentions + DETAILING_PRIOR_WEIGHT));
}

// Best-of eligibility — a detailer may anchor a "Best Auto Detailing in [metro]" page only if it
// has a score AND is credible on Google (mirrors the touchless / hand-wash / self-serve trophy
// gates so a high score next to 2 Google reviews can't crown a thin listing).
export const MIN_DETAILING_TROPHY_RATING = 4.0;
export const MIN_DETAILING_TROPHY_REVIEWS = 20;

export function detailingTrophyEligible(listing: {
  detailing_score?: number | null;
  rating?: number | null;
  review_count?: number | null;
}): boolean {
  return (
    listing.detailing_score != null &&
    (listing.rating ?? 0) >= MIN_DETAILING_TROPHY_RATING &&
    (listing.review_count ?? 0) >= MIN_DETAILING_TROPHY_REVIEWS
  );
}

/**
 * Ranking key for a detailing best-of list. Scored detailers rank by score; unscored-but-credible
 * detailers fall back to a capped Google-rating term so they sit BELOW comparable scored detailers
 * but a metro with few scored detailers can still field a top list (parallel to touchless /
 * hand-wash / self-serve).
 */
export function detailingRankKey(listing: {
  detailing_score?: number | null;
  rating?: number | null;
  review_count?: number | null;
}): number {
  if (listing.detailing_score != null) return listing.detailing_score;
  if ((listing.review_count ?? 0) >= MIN_DETAILING_TROPHY_REVIEWS && (listing.rating ?? 0) > 0) {
    return Math.min(55, Math.round((listing.rating as number) * 11));
  }
  return 0;
}
