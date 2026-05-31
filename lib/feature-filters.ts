/**
 * Feature filter definitions for /state/[state]/[city]/feature/[feature]/ pages.
 *
 * Each filter creates a new indexable subset of city listings, targeting
 * specific search intent (e.g. "touchless car wash open 24 hours in Boston").
 * Powered by existing amenities and hours data — no new content required.
 *
 * Match thresholds: a feature page only goes live for a (state, city, feature)
 * combination if ≥3 listings match. This avoids thin pages.
 */

import type { Listing } from './supabase';

export interface FeatureFilter {
  /** URL slug, e.g. "open-24-hours" */
  slug: string;
  /** Display name for headings, e.g. "Open 24 Hours" */
  displayName: string;
  /** Lowercase phrase used in titles, e.g. "open 24 hours" */
  titlePhrase: string;
  /** Short description shown on the page */
  blurb: string;
  /** Predicate: does this listing match this filter? */
  matches: (listing: Pick<Listing, 'amenities' | 'hours' | 'wash_packages'>) => boolean;
  /** Search-intent keywords for meta description */
  searchKeywords: string[];
}

// ── Helper matchers ──────────────────────────────────────────────────
const hasAmenity = (
  listing: Pick<Listing, 'amenities'>,
  patterns: RegExp[],
): boolean => {
  const amenities = listing.amenities || [];
  return amenities.some((a) =>
    patterns.some((p) => p.test(String(a).toLowerCase())),
  );
};

const isOpen24h = (listing: Pick<Listing, 'hours' | 'amenities'>): boolean => {
  // Check amenities array for explicit 24-hour tag
  if (hasAmenity(listing, [/\b24[\s-]?hour/i, /24\/7/i, /\bopen 24\b/i])) {
    return true;
  }
  // Check hours object for "24 hours" / "open 24" / "00:00–23:59" pattern on any day
  const hours = listing.hours || {};
  return Object.values(hours).some((dayHours) => {
    if (!dayHours) return false;
    const s = String(dayHours).toLowerCase();
    return /24[\s-]?hours?\b|24\/7\b|open 24/i.test(s) ||
           /\b00:00.{0,5}23:59\b/.test(s) ||
           /\b12:00\s*am.{0,8}11:59\s*pm/i.test(s);
  });
};

// ── Filter definitions ──────────────────────────────────────────────
export const FEATURE_FILTERS: FeatureFilter[] = [
  {
    slug: 'open-24-hours',
    displayName: 'Open 24 Hours',
    titlePhrase: 'open 24 hours',
    blurb: 'Touchless car washes that operate 24/7 — wash any time, day or night.',
    matches: isOpen24h,
    searchKeywords: ['24 hour', '24/7', 'open now', 'overnight'],
  },
  {
    // Slug aligned with existing /features/free-vacuum national/state pages
    slug: 'free-vacuum',
    displayName: 'Free Vacuum',
    titlePhrase: 'with free vacuum',
    blurb: 'Touchless car washes that include free self-serve vacuum stations.',
    matches: (l) => hasAmenity(l, [/free vacuum/i, /vacuum.{0,10}free/i]),
    searchKeywords: ['free vacuum', 'vacuum included', 'self-serve vacuum'],
  },
  {
    // Slug aligned with existing /features/unlimited-wash-club pages
    slug: 'unlimited-wash-club',
    displayName: 'Monthly Membership',
    titlePhrase: 'with monthly membership',
    blurb: 'Touchless car washes offering unlimited monthly wash clubs or subscription memberships.',
    matches: (l) =>
      hasAmenity(l, [
        /unlimited.{0,5}wash/i,
        /wash.{0,5}club/i,
        /\bmembership/i,
        /monthly.{0,5}pass/i,
        /subscription/i,
      ]),
    searchKeywords: ['unlimited wash', 'monthly membership', 'wash club', 'subscription'],
  },
  {
    // Slug aligned with existing /features/undercarriage-cleaning pages
    slug: 'undercarriage-cleaning',
    displayName: 'Undercarriage Wash',
    titlePhrase: 'with undercarriage wash',
    blurb: 'Touchless car washes that include undercarriage cleaning — protects against road salt and grime.',
    matches: (l) => hasAmenity(l, [/undercarriage/i]),
    searchKeywords: ['undercarriage wash', 'undercarriage clean', 'rust protection'],
  },
];

export const FEATURE_FILTERS_BY_SLUG: Record<string, FeatureFilter> = Object.fromEntries(
  FEATURE_FILTERS.map((f) => [f.slug, f]),
);

/** Minimum number of matching listings required to publish a feature page */
export const MIN_LISTINGS_FOR_FEATURE_PAGE = 3;
