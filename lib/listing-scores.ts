/**
 * THE list of satisfaction scores a listing legitimately shows — one place, so a
 * multi-service listing (e.g. touchless + self-serve + hand-wash) surfaces EACH score,
 * every one explicitly labeled by category, and never a bare ambiguous number.
 *
 * A category's score is included only when (a) that category is PUBLICLY shown for this
 * listing — the same gate that decides whether its content/reviews render — and (b) the
 * score is non-null (>= 3 mentions). So detailing scores stay hidden until DETAILING_LIVE,
 * self-serve scores only show on reviewed+approved self-serve listings, etc. All four use
 * the SAME 0-100 scale + tiers (tssTier), so they're directly comparable side by side.
 *
 * Consumed by the listing hero (a labeled chip per score) and each category's review module
 * (the score lives in that module's already-labeled header). Order is fixed
 * touchless → self-serve → hand-wash → detailing so multi-score listings read consistently.
 */
import type { WashType } from '@/lib/self-serve';
import { isSelfServePublic } from '@/lib/self-serve';
import { isHandWashPublic } from '@/lib/hand-wash';
import { isDetailingPublic } from '@/lib/detailing';
import { tssTier, type TssTier } from '@/lib/touchless-satisfaction';

export interface CategoryScore {
  key: WashType;
  score: number;
  /** Short label for a hero chip / compact contexts, e.g. "Self-Serve". */
  chipLabel: string;
  /** Full heading label, e.g. "Self-Serve Facility Score". */
  heading: string;
  /** What the number rates, for sub-text / tooltips. */
  measures: string;
  tier: TssTier;
}

const META: Record<WashType, { chipLabel: string; heading: string; measures: string }> = {
  touchless: {
    chipLabel: 'Touchless',
    heading: 'Touchless Satisfaction Score',
    measures: 'the touch-free wash',
  },
  self_serve: {
    // Self-serve is scored on FACILITY quality (bays, water pressure, working
    // coin/vacuum equipment, cleanliness) — the customer washes their own car, so the
    // number rates the place, not the wash. Labeled to say so.
    chipLabel: 'Self-Serve',
    heading: 'Self-Serve Facility Score',
    measures: 'the bays, pressure & equipment',
  },
  hand_wash: {
    chipLabel: 'Hand Wash',
    heading: 'Hand Wash Satisfaction Score',
    measures: 'the attended hand wash',
  },
  detailing: {
    chipLabel: 'Detailing',
    heading: 'Detailing Satisfaction Score',
    measures: 'the detailing work',
  },
};

type ScorableListing = {
  is_touchless?: boolean | null;
  is_approved?: boolean | null;
  touchless_satisfaction_score?: number | null;
  // self-serve gate
  is_self_service?: boolean | null;
  self_service_reviewed_at?: string | null;
  self_service_score?: number | null;
  // hand-wash gate
  is_hand_wash?: boolean | null;
  hand_wash_reviewed_at?: string | null;
  hand_wash_score?: number | null;
  // detailing gate
  is_detailing?: boolean | null;
  detailing_reviewed_at?: string | null;
  detailing_score?: number | null;
};

function mk(key: WashType, score: number): CategoryScore {
  return { key, score, ...META[key], tier: tssTier(score) };
}

/** Every publicly-shown, scored category for this listing, in fixed display order. */
export function getListingScores(listing: ScorableListing): CategoryScore[] {
  const out: CategoryScore[] = [];
  // Touchless is always "live"; its public gate is simply touchless + approved.
  if (listing.is_touchless && listing.is_approved && listing.touchless_satisfaction_score != null) {
    out.push(mk('touchless', listing.touchless_satisfaction_score));
  }
  if (isSelfServePublic(listing) && listing.self_service_score != null) {
    out.push(mk('self_serve', listing.self_service_score));
  }
  if (isHandWashPublic(listing) && listing.hand_wash_score != null) {
    out.push(mk('hand_wash', listing.hand_wash_score));
  }
  if (isDetailingPublic(listing) && listing.detailing_score != null) {
    out.push(mk('detailing', listing.detailing_score));
  }
  return out;
}
