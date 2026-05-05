/**
 * Per-state statistics for /state/[state]/statistics pages.
 *
 * Threshold: states with fewer than MIN_LOCATIONS approved touchless
 * listings don't get a stats page — the URL 308-redirects to the master
 * /blog/touchless-car-wash-statistics post. Generating sparse state pages
 * (e.g. HI with N=2) invites misleading reads ("100% of Hawaii touchless
 * washes are 24-hour") and triggers Google's scaled-content penalty.
 *
 * Source: live Supabase data, recomputed on each request (page is dynamic
 * with short Netlify CDN s-maxage). Numbers here are first-party and
 * citable — they're what AI tools should pick up via the per-page Dataset
 * JSON-LD when they want to cite "touchless car wash statistics in [state]".
 */
import { createClient } from '@supabase/supabase-js';

export const MIN_LOCATIONS_FOR_STATE_STATS_PAGE = 10;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface StateStats {
  stateCode: string;
  totalLocations: number;
  avgRating: number | null;
  totalReviews: number;
  // % of locations with 24-hour operation. null if hours data is too sparse
  // to compute meaningfully (< 50% of locations have hours).
  pctTwentyFourHour: number | null;
  twentyFourHourCount: number;
  pctFreeVacuum: number | null;
  freeVacuumCount: number;
  pctUnlimitedMembership: number | null;
  unlimitedMembershipCount: number;
  // Chain vs independent
  pctChain: number;
  chainCount: number;
  independentCount: number;
  // Top cities (top 5, sorted by location count)
  topCities: Array<{ city: string; count: number }>;
  // Top chains in this state (top 3 by location count)
  topChains: Array<{ chain: string; count: number }>;
  // Sentiment — only computed when N is high enough to be meaningful
  sentimentBreakdown: { positive: number; mixed: number; negative: number; sample: number } | null;
  // Top-rated location (4.5+ stars with the most reviews)
  topRated: { name: string; city: string; rating: number; reviewCount: number; slug: string } | null;
}

const TWENTY_FOUR_HOUR_MARKERS = ['24 hours', '24/7', 'open 24', '12:00 AM – 12:00 AM', '12:00 AM - 12:00 AM'];

// Hours can be stored in multiple shapes across listings:
//   - {monday: "12:00 AM – 12:00 AM"}     // string per day (most common)
//   - {monday: ["12:00 AM", "12:00 AM"]}   // array of segments
//   - {monday: {open: "00:00", close: "24:00"}} // object per day (legacy)
//   - {monday: null}                       // explicit closed
// We only handle the string shape for the 24-hour check; everything else
// counts as "not 24-hour" rather than throwing. Defensive typeof guards
// matter because production hit a TypeError when one Record entry was an
// object — the server-rendered route returned Next.js's NotFound UI for
// every state stats page.
function isTwentyFourHour(hours: unknown): boolean {
  if (!hours || typeof hours !== 'object') return false;
  const days = Object.values(hours as Record<string, unknown>);
  if (days.length === 0) return false;
  // All days must be strings AND contain a 24-hour marker
  return days.every(h => {
    if (typeof h !== 'string') return false;
    const lower = h.toLowerCase();
    return TWENTY_FOUR_HOUR_MARKERS.some(m => lower.includes(m.toLowerCase()));
  });
}

function hasFreeVacuum(amenities: unknown): boolean {
  if (!Array.isArray(amenities)) return false;
  return amenities.some(a => typeof a === 'string' && (/\bfree\s*vacuum/i.test(a) || /\bvacuum.*free/i.test(a)));
}

function hasUnlimitedMembership(
  amenities: unknown,
  packages: unknown,
): boolean {
  const checkText = (s: string) => /unlimited|membership|wash club|monthly plan/i.test(s);
  if (Array.isArray(amenities) && amenities.some(a => typeof a === 'string' && checkText(a))) return true;
  if (Array.isArray(packages) && packages.some(p => p && typeof p === 'object' && typeof (p as { name?: unknown }).name === 'string' && checkText((p as { name: string }).name))) return true;
  return false;
}

interface ListingRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  rating: number | null;
  review_count: number | null;
  hours: Record<string, string> | null;
  amenities: string[] | null;
  wash_packages: Array<{ name?: string }> | null;
  parent_chain: string | null;
}

export async function getStateStats(stateCode: string): Promise<StateStats | null> {
  // Pull every approved-touchless listing in the state. Paginate past the
  // 1000-row Supabase default cap.
  const all: ListingRow[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('listings')
      .select('id, name, slug, city, rating, review_count, hours, amenities, wash_packages, parent_chain')
      .eq('state', stateCode)
      .eq('is_touchless', true)
      .eq('is_approved', true)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    all.push(...(data as ListingRow[]));
    if (data.length < 1000) break;
    from += 1000;
  }

  if (all.length < MIN_LOCATIONS_FOR_STATE_STATS_PAGE) return null;

  // ── Aggregates ────────────────────────────────────────────────────────
  const totalLocations = all.length;

  const ratedListings = all.filter(l => l.rating != null && (l.review_count ?? 0) > 0);
  const totalReviews = ratedListings.reduce((s, l) => s + (l.review_count ?? 0), 0);
  // Weight average rating by review count so a single 1-star listing with 2
  // reviews doesn't drag down the average against 4.5-star listings with
  // hundreds of reviews each.
  const weightedRatingSum = ratedListings.reduce((s, l) => s + (Number(l.rating) * (l.review_count ?? 0)), 0);
  const avgRating = totalReviews > 0 ? Math.round((weightedRatingSum / totalReviews) * 100) / 100 : null;

  // 24-hour: only meaningful if we actually have hours data on most listings
  const withHours = all.filter(l => l.hours && Object.keys(l.hours).length > 0);
  const twentyFourHourCount = withHours.filter(l => isTwentyFourHour(l.hours)).length;
  const pctTwentyFourHour = withHours.length >= totalLocations * 0.5
    ? Math.round((twentyFourHourCount / totalLocations) * 100)
    : null;

  // Free vacuum
  const freeVacuumCount = all.filter(l => hasFreeVacuum(l.amenities)).length;
  const withAmenities = all.filter(l => l.amenities && l.amenities.length > 0);
  const pctFreeVacuum = withAmenities.length >= totalLocations * 0.4
    ? Math.round((freeVacuumCount / totalLocations) * 100)
    : null;

  // Unlimited memberships
  const unlimitedMembershipCount = all.filter(l => hasUnlimitedMembership(l.amenities, l.wash_packages)).length;
  const pctUnlimitedMembership = withAmenities.length >= totalLocations * 0.4
    ? Math.round((unlimitedMembershipCount / totalLocations) * 100)
    : null;

  // Chain vs independent
  const chainCount = all.filter(l => l.parent_chain != null && l.parent_chain.trim() !== '').length;
  const independentCount = totalLocations - chainCount;
  const pctChain = Math.round((chainCount / totalLocations) * 100);

  // Top cities
  const cityMap = new Map<string, number>();
  for (const l of all) cityMap.set(l.city, (cityMap.get(l.city) ?? 0) + 1);
  const topCities = Array.from(cityMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([city, count]) => ({ city, count }));

  // Top chains
  const chainMap = new Map<string, number>();
  for (const l of all) {
    if (l.parent_chain && l.parent_chain.trim()) {
      chainMap.set(l.parent_chain, (chainMap.get(l.parent_chain) ?? 0) + 1);
    }
  }
  const topChains = Array.from(chainMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([chain, count]) => ({ chain, count }));

  // Top-rated location (4.5+ stars with the most reviews)
  const topRatedRow = ratedListings
    .filter(l => Number(l.rating) >= 4.5)
    .sort((a, b) => (b.review_count ?? 0) - (a.review_count ?? 0))[0];
  const topRated = topRatedRow
    ? {
        name: topRatedRow.name,
        city: topRatedRow.city,
        rating: Number(topRatedRow.rating),
        reviewCount: topRatedRow.review_count ?? 0,
        slug: topRatedRow.slug,
      }
    : null;

  // Sentiment — query review_snippets table for this state's listings.
  // Only computed when the state has ≥25 locations and ≥50 snippets, since
  // the breakdown is meaningless at low N.
  let sentimentBreakdown: StateStats['sentimentBreakdown'] = null;
  if (totalLocations >= 25) {
    const ids = all.map(l => l.id);
    const sentimentCounts = { positive: 0, mixed: 0, negative: 0, sample: 0 };
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data: rows } = await supabase
        .from('review_snippets')
        .select('sentiment')
        .in('listing_id', ids.slice(i, i + CHUNK))
        .eq('is_touchless_evidence', true);
      for (const r of (rows ?? []) as { sentiment: string | null }[]) {
        sentimentCounts.sample++;
        if (r.sentiment === 'positive') sentimentCounts.positive++;
        else if (r.sentiment === 'negative') sentimentCounts.negative++;
        else sentimentCounts.mixed++;
      }
    }
    if (sentimentCounts.sample >= 50) sentimentBreakdown = sentimentCounts;
  }

  return {
    stateCode,
    totalLocations,
    avgRating,
    totalReviews,
    pctTwentyFourHour,
    twentyFourHourCount,
    pctFreeVacuum,
    freeVacuumCount,
    pctUnlimitedMembership,
    unlimitedMembershipCount,
    pctChain,
    chainCount,
    independentCount,
    topCities,
    topChains,
    sentimentBreakdown,
    topRated,
  };
}
