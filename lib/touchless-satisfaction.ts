/**
 * Touchless Satisfaction Score — shared helpers.
 *
 * The 0–100 score lives on listings.touchless_satisfaction_score (computed from
 * the Bayesian-shrunk positive share of TOUCHLESS-specific review sentiment,
 * excluding reviews about other bays). The tier label is derived here in code so
 * cutoffs can change without re-scoring. Cutoffs are percentile-calibrated to the
 * real distribution (mean ~69), validated 2026-06-04.
 */

export const TSS_MIN_MENTIONS = 3;

export type TssTier = {
  label: string;
  /** text/accent color */
  color: string;
  /** soft background */
  bg: string;
  /** gauge arc color */
  arc: string;
};

const BANDS: { min: number; tier: TssTier }[] = [
  { min: 84, tier: { label: 'Excellent', color: '#15803d', bg: '#ecfdf5', arc: '#16a34a' } },
  { min: 76, tier: { label: 'Very Good', color: '#16a34a', bg: '#f0fdf4', arc: '#22C55E' } },
  { min: 62, tier: { label: 'Good', color: '#4d7c0f', bg: '#f7fee7', arc: '#84cc16' } },
  { min: 47, tier: { label: 'Fair', color: '#b45309', bg: '#fffbeb', arc: '#f59e0b' } },
  { min: 0, tier: { label: 'Mixed', color: '#64748b', bg: '#f8fafc', arc: '#94a3b8' } },
];

export function tssTier(score: number): TssTier {
  for (const b of BANDS) if (score >= b.min) return b.tier;
  return BANDS[BANDS.length - 1].tier;
}

/** True when a listing has a publishable Touchless Satisfaction Score. */
export function hasTss(listing: {
  touchless_satisfaction_score?: number | null;
}): boolean {
  return (
    listing.touchless_satisfaction_score != null &&
    listing.touchless_satisfaction_score >= 0
  );
}
