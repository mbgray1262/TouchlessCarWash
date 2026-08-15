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
import { cache } from 'react';
import { supabase, LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { slugify, getStateName } from '@/lib/constants';
import { type ProximityListing, bestNearby, INDEXABLE_MIN_EFFECTIVE } from '@/lib/nearby-augment';

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

/** The wash types a community-verification vote can be cast against. */
export type WashType = 'touchless' | 'self_serve' | 'hand_wash' | 'detailing';

/**
 * The PRIMARY wash type a listing's page presents itself as — used to ask the
 * right community-verification question ("Is it touchless?" vs "self-serve?" vs
 * "hand wash?"). Touchless wins for mixed listings: it's the flagship framing
 * and the page already renders touchless copy for them (see isSelfServeOnly).
 * Falls back to 'touchless' for the rare untyped row that only reaches the
 * listing template via the self-serve gate.
 */
export function listingPrimaryWashType(listing: {
  is_touchless?: boolean | null;
  is_self_service?: boolean | null;
  is_hand_wash?: boolean | null;
  is_detailing?: boolean | null;
}): WashType {
  if (listing.is_touchless) return 'touchless';
  if (listing.is_self_service) return 'self_serve';
  if (listing.is_hand_wash) return 'hand_wash';
  if (listing.is_detailing) return 'detailing';
  return 'touchless';
}

/** Count of publicly visible self-serve listings matching the chained filters. */
export function publicSelfServeCount() {
  return publicSelfServeListings('*', { count: 'exact', head: true });
}

// Raw slim row as loaded from the DB (city may be null).
type SelfServeSlim = { id: string; state: string | null; city: string | null; latitude: number | null; longitude: number | null };
// Normalized geo row fed to bestNearby (city coerced to a non-null string, matching NearbyCandidate).
type SlimGeo = { id: string; city: string; latitude: number | null; longitude: number | null };

/**
 * Per-state slim proximity rows for public self-serve augmentation — the
 * self-serve mirror of nearby-augment's getStateListingsForAugment. Only the
 * fields the haversine scan needs; full card data is fetched later for the ~8
 * selected nearby listings via getSelfServeCardsByIds().
 */
export const getStateSelfServeForAugment = cache(
  async (stateCode: string): Promise<ProximityListing[]> => {
    const { data } = await publicSelfServeListings('id, city, latitude, longitude')
      .eq('state', stateCode)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(2000);
    return (data as ProximityListing[]) ?? [];
  },
);

/** Full card data for a set of self-serve listing ids (the ~8 nearby picks). */
export async function getSelfServeCardsByIds(
  ids: string[],
): Promise<Array<Listing & { latitude: number | null; longitude: number | null }>> {
  if (ids.length === 0) return [];
  const { data } = await publicSelfServeListings(`${LISTING_CARD_COLUMNS}, latitude, longitude`).in('id', ids);
  return (data as Array<Listing & { latitude: number | null; longitude: number | null }>) ?? [];
}

/**
 * Effective "in or near" count for a self-serve city — the shared indexability
 * rule. Mirrors the touchless model exactly (lib/nearby-augment.ts): a city
 * page is indexable, and therefore listed in the sitemap, iff
 * (in-city + nearby-within-radius) >= INDEXABLE_MIN_EFFECTIVE. This is THE single
 * source both the city page (200 + index vs 200 + noindex) and the sitemap
 * import, so the "in sitemap ⟺ indexable" invariant can never drift.
 *
 * bestNearby maximizes neighbors over every in-city anchor, so the count is
 * independent of row order — the page (orders in-city by name) and this function
 * (orders by id) reach the identical verdict. Same-city listings are excluded by
 * id, so the name-based exclusion in bestNearby is a redundant secondary guard.
 */
function selfServeEffectiveCount(
  inCity: SlimGeo[],
  statePool: SlimGeo[],
): number {
  if (inCity.length >= INDEXABLE_MIN_EFFECTIVE) return inCity.length;
  const excludeIds = new Set(inCity.map((l) => l.id));
  const cityName = (inCity[0]?.city ?? '').toLowerCase().trim();
  const nearby = bestNearby(inCity, statePool, cityName, excludeIds).length;
  return inCity.length + nearby;
}

/**
 * The cities that qualify for a self-serve city hub — those whose effective
 * "in or near" count reaches INDEXABLE_MIN_EFFECTIVE. Grouped by state code +
 * city SLUG (so name variants that slugify the same are counted together,
 * matching how the page resolves its slug). Used by BOTH /sitemap.xml and the
 * state hub's city links. `count` is the in-city count (for display).
 */
export async function qualifyingSelfServeCities(): Promise<
  { stateCode: string; stateSlug: string; citySlug: string; cityName: string; count: number }[]
> {
  // One scan of all public self-serve slim rows.
  const rows: SelfServeSlim[] = [];
  let from = 0;
  while (true) {
    const { data } = await publicSelfServeListings('id, state, city, latitude, longitude').order('id').range(from, from + 999);
    if (!data || !data.length) break;
    rows.push(...(data as SelfServeSlim[]));
    from += data.length;
    if (data.length < 1000) break;
  }
  // Group into per-city (by state + city slug) and per-state proximity pools.
  const byCity = new Map<string, { stateCode: string; cityName: string; rows: SlimGeo[] }>();
  const byState = new Map<string, SlimGeo[]>();
  for (const r of rows) {
    const code = (r.state || '').toUpperCase();
    const city = r.city || '';
    const cslug = slugify(city);
    if (!code || !cslug) continue;
    const geo: SlimGeo = { id: r.id, city, latitude: r.latitude, longitude: r.longitude };
    const key = `${code}/${cslug}`;
    const g = byCity.get(key);
    if (g) g.rows.push(geo);
    else byCity.set(key, { stateCode: code, cityName: city, rows: [geo] });
    const pool = byState.get(code) ?? [];
    pool.push(geo);
    byState.set(code, pool);
  }
  const out: { stateCode: string; stateSlug: string; citySlug: string; cityName: string; count: number }[] = [];
  for (const [key, g] of Array.from(byCity.entries())) {
    const effective = selfServeEffectiveCount(g.rows, byState.get(g.stateCode) ?? []);
    if (effective < INDEXABLE_MIN_EFFECTIVE) continue;
    const citySlug = key.split('/')[1];
    out.push({
      stateCode: g.stateCode,
      stateSlug: slugify(getStateName(g.stateCode)),
      citySlug,
      cityName: g.cityName,
      count: g.rows.length,
    });
  }
  return out.sort((a, b) => b.count - a.count || a.stateCode.localeCompare(b.stateCode));
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
