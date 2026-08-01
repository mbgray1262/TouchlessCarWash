/**
 * THE hand-wash public directory: master switch + visibility rule, in one place.
 * Mirrors lib/self-serve.ts (which mirrors lib/public-listings.ts for touchless).
 *
 * HAND_WASH_LIVE is the category master switch. While FALSE:
 *   - every /hand-car-wash page still RENDERS (so it can be previewed), but noindex,
 *   - none of its URLs are emitted in /sitemap.xml,
 *   - no touchless/self-serve page links to it (nav item gated on this flag).
 * So Google never discovers it and the SEO invariants hold (noindex ⟺ absent from
 * sitemap; no broken internal links). Flip to TRUE (one line) + deploy to launch.
 *
 * Visibility rule for a hand-wash listing to be public:
 *   is_hand_wash = true  AND  is_approved = true  AND  hand_wash_reviewed_at IS NOT NULL
 * The hand_wash_reviewed_at clause mirrors self_service_reviewed_at: a listing only
 * enters the hand-wash directory once the admin has consciously reviewed + approved it
 * in the photo-audit Hand Wash queue (real attended hand wash + appropriate photos).
 */
import { supabase } from '@/lib/supabase';
import { slugify, getStateName } from '@/lib/constants';

/** Category master switch. Flip to true (+ deploy) to launch the hand-wash directory.
 *  Built gated (false) so the whole section can be assembled + verify:seo'd while invisible
 *  to Google (noindex ⟺ absent from sitemap; no internal links), then flipped in one commit. */
export const HAND_WASH_LIVE = true;

/** Landing hero — a real attended-hand-wash photo from our own top-scored listings. */
export const HAND_WASH_HERO_IMAGE =
  'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/137887f1-5e09-4db3-b428-481d436cbe72/ai-hero-1785500852381.jpg';

type SelectOpts = { count?: 'exact' | 'planned' | 'estimated'; head?: boolean };

/** Query builder pre-filtered to publicly visible HAND-WASH listings. Chain
 *  further filters/orders/limits like a raw `.from('listings').select()`. */
export function publicHandWashListings(columns: string, opts?: SelectOpts) {
  return supabase
    .from('listings')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select<string, any>(columns, opts)
    .eq('is_hand_wash', true)
    .eq('is_approved', true)
    .not('hand_wash_reviewed_at', 'is', null);
}

/** True if a single listing should render as a public hand-wash page. Used by the
 *  listing-detail redirect gate so a hand-wash-only listing renders instead of
 *  308-ing — but only when the category is live. While HAND_WASH_LIVE is false this
 *  is always false, so hand-wash-only listings keep redirecting until launch. */
export function isHandWashPublic(listing: {
  is_hand_wash?: boolean | null;
  is_approved?: boolean | null;
  hand_wash_reviewed_at?: string | null;
}): boolean {
  return HAND_WASH_LIVE && !!listing.is_hand_wash && !!listing.is_approved && !!listing.hand_wash_reviewed_at;
}

/**
 * COPY SWITCH for the shared listing-detail template. When a listing is a hand wash
 * and NOT touchless and NOT self-serve, every touchless-branded string flips to
 * hand-wash wording. Touchless + self-serve keep their flagship framing (a mixed
 * touchless+hand-wash listing renders as touchless), so this is simply "a hand wash
 * that isn't touchless or self-serve". Copy-only — never affects visibility.
 */
export function isHandWashOnly(listing: {
  is_hand_wash?: boolean | null;
  is_touchless?: boolean | null;
  is_self_service?: boolean | null;
}): boolean {
  return !!listing.is_hand_wash && !listing.is_touchless && !listing.is_self_service;
}

/** Count of publicly visible hand-wash listings matching the chained filters. */
export function publicHandWashCount() {
  return publicHandWashListings('*', { count: 'exact', head: true });
}

/**
 * Minimum public hand-wash listings a city needs before it earns its own
 * /hand-car-wash/<state>/<city> hub page. Below this a city hub would be a
 * thin/near-duplicate of the single listing's own page. THE shared threshold —
 * both the city-hub page (200-vs-404) and the sitemap import it, so the
 * "in sitemap ⟺ indexable" invariant can never drift.
 */
export const MIN_HAND_WASH_CITY = 5;

/**
 * The cities that qualify for a hand-wash city hub (>= MIN_HAND_WASH_CITY public
 * hand-wash listings). One scan, grouped by state code + city SLUG. Used by BOTH
 * /sitemap.xml and the state hub's city links.
 */
export async function qualifyingHandWashCities(): Promise<
  { stateCode: string; stateSlug: string; citySlug: string; cityName: string; count: number }[]
> {
  const groups = new Map<string, { stateCode: string; cityName: string; count: number }>();
  let from = 0;
  while (true) {
    const { data } = await publicHandWashListings('state, city').order('id').range(from, from + 999);
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
    if (g.count < MIN_HAND_WASH_CITY) continue;
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

/** Per-state counts of public hand-wash listings, sorted desc. Used by the landing
 *  "browse by state" grid and the sitemap. Small volume — one scan. */
export async function handWashStateTally(): Promise<{ code: string; count: number }[]> {
  const tally: Record<string, number> = {};
  let from = 0;
  while (true) {
    const { data } = await publicHandWashListings('state').order('id').range(from, from + 999);
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
