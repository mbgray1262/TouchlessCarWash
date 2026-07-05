/**
 * THE public-visibility rule, in one place.
 *
 * A listing may appear on any public surface — page bodies, counts, search
 * results, carousels, CSV exports, the sitemap — only if it is BOTH
 * `is_touchless = true` AND `is_approved = true`. Unapproved listings
 * 308-redirect when visited, so surfacing them anywhere creates dead-feeling
 * links and count drift between pages (the exact bug class behind the
 * Review Mine banner mismatch and the About-page "+80 listings" drift).
 *
 * Every public read of the `listings` table must start from this builder
 * instead of hand-writing `.eq('is_touchless', true).eq('is_approved', true)`.
 * Admin surfaces, and the handful of intentional exceptions (listing-detail
 * fetch that must see unapproved rows to 308 them, city-name resolution,
 * geo-fallback anchors), query `listings` directly and say why in a comment.
 *
 * The SQL count RPCs (`state_listing_counts`, `feature_state_counts`,
 * `feature_total_count`) duplicate this rule in the database by necessity —
 * if the visibility rule ever changes, update those migrations too.
 */
import { supabase } from '@/lib/supabase';

type SelectOpts = {
  count?: 'exact' | 'planned' | 'estimated';
  head?: boolean;
};

/** Query builder pre-filtered to publicly visible listings. Chain further
 *  filters/orders/limits exactly as with a raw `.from('listings').select()`.
 *  Rows are typed `any` (columns is a runtime string, so supabase-js can't
 *  infer a row type) — call sites cast, same as they did with inline selects. */
export function publicListings(columns: string, opts?: SelectOpts) {
  return supabase
    .from('listings')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select<string, any>(columns, opts)
    .eq('is_touchless', true)
    .eq('is_approved', true);
}

/** Count of publicly visible listings matching the chained filters. */
export function publicListingsCount() {
  return publicListings('*', { count: 'exact', head: true });
}
