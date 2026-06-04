import type { Filter } from '@/lib/listing-queries';

/**
 * Synthetic "Paint-Safe Verified" filter chip.
 *
 * Unlike the amenity filters (which live in the `filters` table and join through
 * `listing_filters`), this chip filters on the boolean `listings.paint_safe_verified`
 * column. To reuse the existing chip UI + URL machinery, we inject a synthetic Filter
 * with a reserved negative id and a stable slug. Each page that supports the chip
 * detects the slug and applies the `paint_safe_verified = true` predicate in its own
 * filtering layer (in-memory map on the city page, server query on state/search).
 */
export const PAINT_SAFE_FILTER_SLUG = 'paint-safe-verified';
export const PAINT_SAFE_FILTER_ID = -1;

export const PAINT_SAFE_FILTER: Filter = {
  id: PAINT_SAFE_FILTER_ID,
  name: 'Paint-Safe Verified',
  slug: PAINT_SAFE_FILTER_SLUG,
  category: 'wash-type',
  icon: 'shield-check',
};

/**
 * Prepend the Paint-Safe Verified chip to a filter list — but only when at least
 * one listing in scope has earned the badge, so we never show an empty filter.
 */
export function withPaintSafeChip(filters: Filter[], hasVerified: boolean): Filter[] {
  if (!hasVerified) return filters;
  if (filters.some((f) => f.slug === PAINT_SAFE_FILTER_SLUG)) return filters;
  return [PAINT_SAFE_FILTER, ...filters];
}
