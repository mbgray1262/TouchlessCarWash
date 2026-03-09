/**
 * Scoring algorithm for ranking touchless car wash listings.
 *
 * Composite score (0–100) based on:
 *   - Google rating:        30%
 *   - Review volume:        25%  (log-scaled)
 *   - Touchless evidence:   15%  (has review snippets)
 *   - Sentiment quality:    10%  (AI-analyzed review sentiment)
 *   - Data completeness:    10%  (photos, hours, phone, etc.)
 *   - Featured bonus:       10%
 */

import type { Listing } from '@/lib/supabase';

export interface ScoredListing extends Listing {
  score: number;
  distanceMiles?: number;
}

/**
 * Score a single listing. Returns 0–100.
 */
export function scoreListing(
  listing: Listing,
  opts?: { touchlessReviewCount?: number },
): number {
  let score = 0;

  // ── Rating (30 points max) ──────────────────────────────────────────
  const rating = listing.rating ?? 0;
  score += (rating / 5) * 30;

  // ── Review volume (25 points max) ───────────────────────────────────
  // Log-scaled: a listing with ~500 reviews gets the full 25 points.
  const reviewCount = listing.review_count ?? 0;
  const reviewScore = Math.min(Math.log10(reviewCount + 1) / Math.log10(500), 1);
  score += reviewScore * 25;

  // ── Touchless evidence (15 points max) ──────────────────────────────
  // If the listing has touchless-related review snippets, award full points.
  // Partial credit for listings with extraction done but no evidence (at least checked).
  const trCount = opts?.touchlessReviewCount ?? 0;
  if (trCount >= 3) {
    score += 15;
  } else if (trCount >= 1) {
    score += 10;
  }
  // 0 points if no touchless review evidence

  // ── Touchless sentiment (10 points max) ─────────────────────────────
  // Simple positive/negative/neutral from touchless review analysis.
  // Positive = 10, Neutral/unknown = 5 (default), Negative = 0.
  const sentiment = listing.touchless_sentiment;
  if (sentiment === 'positive') score += 10;
  else if (sentiment === 'negative') score += 0;
  else score += 5; // neutral or null — don't penalize before backfill

  // ── Data completeness (10 points max) ───────────────────────────────
  let completeness = 0;
  if (listing.hero_image || listing.google_photo_url) completeness += 3; // Has photo
  if (listing.hours && Object.keys(listing.hours).length > 0) completeness += 2; // Has hours
  if (listing.phone) completeness += 2; // Has phone
  if (listing.amenities && listing.amenities.length > 0) completeness += 2; // Has amenities
  if (listing.website) completeness += 1; // Has website
  score += completeness;

  // ── Featured bonus (10 points max) ──────────────────────────────────
  if (listing.is_featured) {
    score += 10;
  }

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
