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
 * Re-weighted 2026-06-25 to make the Touchless Satisfaction Score genuinely
 * DECISIVE. The previous split let the Paint-Safe verified badge (flat 20) plus
 * raw review volume override a clearly-higher touchless score — so an
 * "Excellent" (86) wash could rank BELOW a "Good" (68) one (Cincinnati: Four
 * Seasons vs Woody's). For a site whose identity IS the touchless score, the #1
 * wash must be the best TOUCHLESS wash. Volume (rewards big busy chains, not
 * touchless quality) and the paint-safe cliff are trimmed; TSS carries 60.
 *
 * Composite score (0–100):
 *   - Touchless Quality:    60  (touchless_satisfaction_score; fallback to a
 *                                capped Google-rating term for unscored washes,
 *                                so they rank BELOW comparable scored washes but
 *                                metros with few scored washes still field a top-3)
 *   - Paint-Safe:           15  (verified badge = full; else granular paint_score)
 *   - Google rating:        12  (minor factor)
 *   - Review volume:         8  (minor tie-breaker, log-scaled)
 *   - Data completeness:     5
 */

import type { Listing } from '@/lib/supabase';
import { GOOD_TIER_MIN } from '@/lib/touchless-satisfaction';

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

// ── Trophy DISPLAY gate ───────────────────────────────────────────────
// `isTrophyEligible` decides who goes INTO best_of_rankings (and thus onto the
// /best directory list + sitemap). `earnsTrophy` is the narrower DISPLAY gate:
// a ranked wash only wears a #N trophy badge / "#N Best …" endorsement when its
// own Touchless Satisfaction Score is at least "Good". This keeps the /best page
// and its ranked list intact (SEO unchanged) while never crowning a "Fair"/"Mixed"
// wash that merely tops a thin metro. Pages whose top wash misses this bar render
// as a neutral "Top-Rated …" ranked list instead of a trophy/medal podium.
export function earnsTrophy(
  listing: { touchless_satisfaction_score?: number | null },
): boolean {
  return (listing.touchless_satisfaction_score ?? -1) >= GOOD_TIER_MIN;
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

  // ── Touchless Quality (60 max) — PRIMARY, proprietary, DECISIVE ─────
  const tss = listing.touchless_satisfaction_score;
  if (tss != null) {
    score += (tss / 100) * 60;
  } else {
    // Unscored fallback: capped Google-rating term (max 30) so an unscored
    // wash ranks below any "Good" (≥60) scored wash but sparse metros still
    // produce winners.
    score += (rating / 5) * 30;
  }

  // ── Paint-Safe (15 max) — proprietary ───────────────────────────────
  if (listing.paint_safe_verified) {
    score += 15;
  } else if (listing.paint_score != null) {
    score += Math.min(Math.max(listing.paint_score, 0), 100) / 100 * 12; // capped < verified badge
  }

  // ── Google rating (12 max) — MINOR factor ───────────────────────────
  score += (rating / 5) * 12;

  // ── Review volume (8 max) — MINOR tie-breaker (log-scaled) ──────────
  const reviewCount = listing.review_count ?? 0;
  score += Math.min(Math.log10(reviewCount + 1) / Math.log10(500), 1) * 8;

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
