/**
 * THE detailing public directory: master switch + visibility rule, in one place.
 * Mirrors lib/hand-wash.ts (which mirrors lib/self-serve.ts / lib/public-listings.ts).
 *
 * DETAILING_LIVE is the category master switch. While FALSE:
 *   - every /car-detailing page still RENDERS (so it can be previewed), but noindex,
 *   - none of its URLs are emitted in /sitemap.xml,
 *   - no other-category page links to it (nav item gated on this flag).
 * So Google never discovers it and the SEO invariants hold (noindex ⟺ absent from
 * sitemap; no broken internal links). Flip to TRUE (one line) + deploy to launch.
 *
 * Visibility rule for a detailing listing to be public:
 *   is_detailing = true  AND  is_approved = true  AND  detailing_reviewed_at IS NOT NULL
 * The detailing_reviewed_at clause mirrors hand_wash_reviewed_at: a listing only
 * enters the detailing directory once the admin has consciously reviewed + approved it
 * in the photo-audit Detailing queue (real detailer + appropriate photos).
 */
import { supabase } from '@/lib/supabase';
import { slugify, getStateName } from '@/lib/constants';

/** Category master switch. Flip to true (+ deploy) to launch the detailing directory.
 *  Built gated (false) so the whole section can be assembled + verify:seo'd while invisible
 *  to Google (noindex ⟺ absent from sitemap; no internal links), then flipped in one commit. */
export const DETAILING_LIVE = false;

/** Landing hero — a real detailing photo from our own top-scored listings.
 *  TODO(detailing-launch): swap for a curated top-scored detailer hero once the capped
 *  photo pass has run; placeholder until then (never shown while DETAILING_LIVE=false). */
export const DETAILING_HERO_IMAGE =
  'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/137887f1-5e09-4db3-b428-481d436cbe72/ai-hero-1785500852381.jpg';

type SelectOpts = { count?: 'exact' | 'planned' | 'estimated'; head?: boolean };

/** Query builder pre-filtered to publicly visible DETAILING listings. Chain
 *  further filters/orders/limits like a raw `.from('listings').select()`. */
export function publicDetailingListings(columns: string, opts?: SelectOpts) {
  return supabase
    .from('listings')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select<string, any>(columns, opts)
    .eq('is_detailing', true)
    .eq('is_approved', true)
    .not('detailing_reviewed_at', 'is', null);
}

/** True if a single listing should render as a public detailing page. Used by the
 *  listing-detail redirect gate so a detailing-only listing renders instead of
 *  308-ing — but only when the category is live. While DETAILING_LIVE is false this
 *  is always false, so detailing-only listings keep redirecting until launch. */
export function isDetailingPublic(listing: {
  is_detailing?: boolean | null;
  is_approved?: boolean | null;
  detailing_reviewed_at?: string | null;
}): boolean {
  return DETAILING_LIVE && !!listing.is_detailing && !!listing.is_approved && !!listing.detailing_reviewed_at;
}

/**
 * COPY SWITCH for the shared listing-detail template. When a listing is a detailer
 * and NOT touchless, NOT self-serve, and NOT hand-wash, every touchless-branded
 * string flips to detailing wording. The other three categories keep their framing
 * (a detailer that's also a hand wash renders as a hand wash), so this is simply "a
 * detailer that isn't any of the wash categories". Copy-only — never affects visibility.
 */
export function isDetailingOnly(listing: {
  is_detailing?: boolean | null;
  is_touchless?: boolean | null;
  is_self_service?: boolean | null;
  is_hand_wash?: boolean | null;
}): boolean {
  return !!listing.is_detailing && !listing.is_touchless && !listing.is_self_service && !listing.is_hand_wash;
}

/** Count of publicly visible detailing listings matching the chained filters. */
export function publicDetailingCount() {
  return publicDetailingListings('*', { count: 'exact', head: true });
}

/**
 * Minimum public detailing listings a city needs before it earns its own
 * /car-detailing/<state>/<city> hub page. Below this a city hub would be a
 * thin/near-duplicate of the single listing's own page. THE shared threshold —
 * both the city-hub page (200-vs-404) and the sitemap import it, so the
 * "in sitemap ⟺ indexable" invariant can never drift.
 */
export const MIN_DETAILING_CITY = 5;

/**
 * The cities that qualify for a detailing city hub (>= MIN_DETAILING_CITY public
 * detailing listings). One scan, grouped by state code + city SLUG. Used by BOTH
 * /sitemap.xml and the state hub's city links.
 */
export async function qualifyingDetailingCities(): Promise<
  { stateCode: string; stateSlug: string; citySlug: string; cityName: string; count: number }[]
> {
  const groups = new Map<string, { stateCode: string; cityName: string; count: number }>();
  let from = 0;
  while (true) {
    const { data } = await publicDetailingListings('state, city').order('id').range(from, from + 999);
    if (!data || !data.length) break;
    for (const r of data as { state: string | null; city: string | null }[]) {
      const code = (r.state || '').toUpperCase();
      const city = r.city || '';
      const cslug = slugify(city);
      if (!code || !cslug) continue;
      const key = `${code}/${cslug}`;
      const g = groups.get(key);
      if (g) g.count++;
      else groups.set(key, { stateCode: code, cityName: city, count: 1 });
    }
    from += data.length;
    if (data.length < 1000) break;
  }
  const out: { stateCode: string; stateSlug: string; citySlug: string; cityName: string; count: number }[] = [];
  for (const [key, g] of Array.from(groups.entries())) {
    if (g.count < MIN_DETAILING_CITY) continue;
    const citySlug = key.split('/')[1];
    out.push({
      stateCode: g.stateCode,
      stateSlug: slugify(getStateName(g.stateCode)),
      citySlug,
      cityName: g.cityName,
      count: g.count,
    });
  }
  return out.sort((a, b) => b.count - a.count || a.stateCode.localeCompare(b.stateCode));
}

/** Per-state counts of public detailing listings, sorted desc. Used by the landing
 *  "browse by state" grid and the sitemap. Small volume — one scan. */
export async function detailingStateTally(): Promise<{ code: string; count: number }[]> {
  const tally: Record<string, number> = {};
  let from = 0;
  while (true) {
    const { data } = await publicDetailingListings('state').order('id').range(from, from + 999);
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
