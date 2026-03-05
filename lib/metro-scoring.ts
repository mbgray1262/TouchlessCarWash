/**
 * Scoring algorithm for ranking touchless car wash listings.
 *
 * Composite score (0–100) based on:
 *   - Google rating:        35%
 *   - Review volume:        25%  (log-scaled)
 *   - Touchless evidence:   15%  (has review snippets)
 *   - Data completeness:    15%  (photos, hours, phone, etc.)
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

  // ── Rating (35 points max) ──────────────────────────────────────────
  const rating = listing.rating ?? 0;
  score += (rating / 5) * 35;

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

  // ── Data completeness (15 points max) ───────────────────────────────
  let completeness = 0;
  if (listing.hero_image || listing.google_photo_url) completeness += 4; // Has photo
  if (listing.hours && Object.keys(listing.hours).length > 0) completeness += 3; // Has hours
  if (listing.phone) completeness += 3; // Has phone
  if (listing.amenities && listing.amenities.length > 0) completeness += 3; // Has amenities
  if (listing.website) completeness += 2; // Has website
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
