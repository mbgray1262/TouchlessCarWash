/**
 * Scoring algorithm for ranking touchless car wash listings.
 *
 * Rebased 2026-06-08 onto our PROPRIETARY signals — the Touchless Satisfaction
 * Score (touchless-specific sentiment) and Paint-Safe (paint-safety) — which
 * measure the wash experience visitors actually care about, rather than the
 * Google star rating (confounded by gas/store/staff). Google rating + volume
 * stay only as a MINOR factor / graceful fallback for washes that don't yet
 * have enough touchless reviews to earn a score.
 *
 * Composite score (0–100):
 *   - Touchless Quality:    50  (touchless_satisfaction_score; fallback to a
 *                                capped Google-rating term for unscored washes,
 *                                so they rank BELOW comparable scored washes but
 *                                metros with few scored washes still field a top-3)
 *   - Paint-Safe:           20  (verified badge = full; else granular paint_score)
 *   - Google rating+volume: 25  (minor factor / fallback)
 *   - Data completeness:     5
 */

import type { Listing } from '@/lib/supabase';

export interface ScoredListing extends Listing {
  score: number;
  distanceMiles?: number;
}

// ── Trophy eligibility gate ───────────────────────────────────────────
// A "Best Touchless" winner must (1) have our proprietary Touchless Quality
// Score — no score means we can't say it's a satisfying touchless wash, so it
// shouldn't be crowned — AND (2) be credible on Google (a high score next to a
// 3-star / 2-review listing looks wrong). No ungated fallback: a metro with no
// eligible washes simply has no winners (and no /best page) rather than crowning
// a thin/unscored listing. "Not every best-of page needs trophy winners."
export const MIN_TROPHY_RATING = 4.0;
export const MIN_TROPHY_REVIEWS = 20;

export function isTrophyEligible(
  listing: { rating?: number | null; review_count?: number | null; touchless_satisfaction_score?: number | null },
): boolean {
  return (
    listing.touchless_satisfaction_score != null &&
    (listing.rating ?? 0) >= MIN_TROPHY_RATING &&
    (listing.review_count ?? 0) >= MIN_TROPHY_REVIEWS
  );
}

/**
 * Score a single listing. Returns 0–100. PROPRIETARY-FIRST (see header).
 * (touchlessReviewCount kept for call-site compatibility; the Touchless
 * Satisfaction Score now carries the touchless-quality signal directly.)
 */
export function scoreListing(
  listing: Listing,
  _opts?: { touchlessReviewCount?: number },
): number {
  let score = 0;
  const rating = listing.rating ?? 0;

  // ── Touchless Quality (50 max) — PRIMARY, proprietary ───────────────
  const tss = listing.touchless_satisfaction_score;
  if (tss != null) {
    score += (tss / 100) * 50;
  } else {
    // Unscored fallback: capped Google-rating term (max 30) so an unscored
    // wash ranks below any "Good" (≥60) scored wash but sparse metros still
    // produce winners.
    score += (rating / 5) * 30;
  }

  // ── Paint-Safe (20 max) — proprietary ───────────────────────────────
  if (listing.paint_safe_verified) {
    score += 20;
  } else if (listing.paint_score != null) {
    score += Math.min(Math.max(listing.paint_score, 0), 100) / 100 * 15; // capped < verified badge
  }

  // ── Google rating + volume (25 max) — MINOR factor / fallback ───────
  score += (rating / 5) * 15;
  const reviewCount = listing.review_count ?? 0;
  score += Math.min(Math.log10(reviewCount + 1) / Math.log10(500), 1) * 10;

  // ── Data completeness (5 max) ───────────────────────────────────────
  let completeness = 0;
  if (listing.hero_image || listing.google_photo_url) completeness += 2;
  if (listing.hours && Object.keys(listing.hours).length > 0) completeness += 1;
  if (listing.phone) completeness += 1;
  if (listing.amenities && listing.amenities.length > 0) completeness += 1;
  score += completeness;

  return Math.round(score * 10) / 10; // One decimal place
}

/**
 * Score and rank an array of listings. Returns top N sorted by score.
 */
export function rankListings(
  listings: Listing[],
  touchlessReviewCounts: Map<string, number>,
  topN: number = 10,
): ScoredListing[] {
  const scored: ScoredListing[] = listings.map((listing) => ({
    ...listing,
    score: scoreListing(listing, {
      touchlessReviewCount: touchlessReviewCounts.get(listing.id) ?? 0,
    }),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topN);
}
