/**
 * THE self-serve public directory: master switch + visibility rule, in one place.
 * Mirrors lib/public-listings.ts for the parallel /self-serve-car-wash section.
 *
 * SELF_SERVE_LIVE is the category master switch. While FALSE:
 *   - every /self-serve-car-wash page still RENDERS (so it can be previewed),
 *     but is marked robots:noindex,
 *   - none of its URLs are emitted in /sitemap.xml,
 *   - no touchless page links to it (nav item + home banner are gated on this flag).
 * So Google never discovers it and the SEO invariants hold (noindex ⟺ absent from
 * sitemap; no broken internal links). Flip to TRUE (one line) + deploy to launch:
 * the pages become index + self-canonical, enter the sitemap, and the links appear.
 *
 * Visibility rule for a self-serve listing to be public:
 *   is_self_service = true  AND  is_approved = true  AND  self_service_reviewed_at IS NOT NULL
 * The self_service_reviewed_at clause is deliberate: ~1,000 mixed touchless+self-serve
 * listings are already is_approved (they're live touchless), but must NOT appear in the
 * self-serve directory until the admin has consciously reviewed them in the self-serve
 * context (confirmed real bays + appropriate photos). See project_self_serve_broadening.
 */
import { supabase } from '@/lib/supabase';

/** Category master switch. Flip to true (+ deploy) to launch the self-serve directory. */
export const SELF_SERVE_LIVE = true;

/** Landing hero — a real self-serve wash-bay photo from our own curated listings.
 *  Swap for any of the admin-approved self-serve heroes. */
export const SELF_SERVE_HERO_IMAGE =
  'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/32d9a6a6-26fe-472b-8c59-2e4f3db19872/hero-cropped-1783694011166.jpg';

type SelectOpts = { count?: 'exact' | 'planned' | 'estimated'; head?: boolean };

/** Query builder pre-filtered to publicly visible SELF-SERVE listings. Chain
 *  further filters/orders/limits like a raw `.from('listings').select()`. */
export function publicSelfServeListings(columns: string, opts?: SelectOpts) {
  return supabase
    .from('listings')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select<string, any>(columns, opts)
    .eq('is_self_service', true)
    .eq('is_approved', true)
    .not('self_service_reviewed_at', 'is', null);
}

/** True if a single listing should render as a public self-serve page. Used by
 *  the listing-detail redirect gate so a self-serve-only listing renders instead
 *  of 308-ing — but only when the category is live. While SELF_SERVE_LIVE is
 *  false this is always false, so self-serve-only listings keep redirecting and
 *  the live site is unchanged. */
export function isSelfServePublic(listing: {
  is_self_service?: boolean | null;
  is_approved?: boolean | null;
  self_service_reviewed_at?: string | null;
}): boolean {
  return SELF_SERVE_LIVE && !!listing.is_self_service && !!listing.is_approved && !!listing.self_service_reviewed_at;
}

/**
 * COPY SWITCH for the shared listing-detail template. A listing renders that
 * template if it's touchless-public OR (when live) self-serve-public. When the
 * listing is NOT a touchless wash, every touchless-branded string on the page
 * ("Touchless & Brushless", "Paint-Safe", the touchless FAQs, the meta title)
 * must flip to self-serve wording. Mixed listings (is_touchless=true AND
 * is_self_service=true) keep the touchless copy — touchless is the flagship
 * framing and they earned it. So the switch is simply "not a touchless wash":
 * true for self-serve-only (and the handful of untyped is_touchless=null rows
 * that only reach this template via the self-serve gate). This is copy-only —
 * it never affects visibility (that's isSelfServePublic / publicListings).
 */
export function isSelfServeOnly(listing: {
  is_self_service?: boolean | null;
  is_touchless?: boolean | null;
}): boolean {
  return !!listing.is_self_service && !listing.is_touchless;
}

/** Count of publicly visible self-serve listings matching the chained filters. */
export function publicSelfServeCount() {
  return publicSelfServeListings('*', { count: 'exact', head: true });
}

/** Per-state counts of public self-serve listings, sorted desc. Used by the
 *  landing "browse by state" grid and the sitemap. Small volume — one scan. */
export async function selfServeStateTally(): Promise<{ code: string; count: number }[]> {
  const tally: Record<string, number> = {};
  let from = 0;
  while (true) {
    const { data } = await publicSelfServeListings('state').order('id').range(from, from + 999);
    if (!data || !data.length) break;
    for (const r of data as { state: string | null }[]) {
      const s = (r.state || '').toUpperCase();
      if (s) tally[s] = (tally[s] || 0) + 1;
    }
    from += data.length;
    if (data.length < 1000) break;
  }
  return Object.entries(tally).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
}
