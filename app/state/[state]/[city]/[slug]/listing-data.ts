/**
 * Data layer for the listing detail page — every Supabase read the page (and
 * its generateMetadata) makes lives here. Pure fetch + shape logic, no JSX.
 */
import { cache } from 'react';
import { supabase, type Listing, type ReviewSnippet } from '@/lib/supabase';
import { publicListings } from '@/lib/public-listings';
import { US_STATES, slugify } from '@/lib/constants';
import type { VerificationStats } from '@/components/VerificationPrompt';
import type { PaintSnippet, PaintTheme } from '@/components/PaintSafeModule';
import type { ScoreRankItem } from '@/components/TouchlessScoreComparison';

export async function getListing(slug: string): Promise<Listing | null> {
  // Fetch by slug regardless of is_touchless — we want to handle three cases:
  //   1. Touchless listing exists → render detail page
  //   2. Listing exists but is_touchless=false (reverted) → 301 redirect
  //      to city hub (NOT a 404) to preserve AdSense health + PageRank
  //   3. Listing doesn't exist at all → 404 (after trying slug-prefix
  //      lookup for old URL schemes)
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) return null;
  return data as Listing;
}

/**
 * Build a canonical listing URL from a DB row.
 */
export function buildListingUrl(match: { slug: string; city: string; state: string }): string {
  const matchStateSlug = slugify(
    US_STATES.find((s) => s.code === match.state)?.name ?? match.state,
  );
  const matchCitySlug = slugify(match.city);
  return `/state/${matchStateSlug}/${matchCitySlug}/${match.slug}`;
}

/**
 * Old slug formats sometimes end with a numeric Google Places ID (e.g. "-15939").
 * Strip that suffix so we can match against the current address-based slug format.
 */
function stripTrailingNumericId(slug: string): string {
  return slug.replace(/-\d+$/, '');
}

/**
 * Try to find a listing whose slug starts with the requested slug.
 * Handles old short slugs (e.g. "rice-street-car-wash") that were later
 * replaced with longer address-based slugs, AND old Google-Places-ID slugs
 * (e.g. "car-wash-depot-llc-canton-georgia-15939") by stripping the numeric suffix.
 * Returns the canonical URL path for the matching listing, or null.
 */
export async function findListingByPartialSlug(slug: string): Promise<string | null> {
  // Intentionally NOT gated on is_approved (unlike publicListings): this only
  // resolves old URLs to a redirect target, and an unapproved target's URL
  // safely 308s onward to the city hub. Gating it would turn those into 404s.
  // 1. Try the slug as a direct prefix match (existing behaviour)
  const { data: d1 } = await supabase
    .from('listings')
    .select('slug, city, state')
    .like('slug', `${slug}-%`)
    .eq('is_touchless', true)
    .limit(1);
  if (d1?.[0]) return buildListingUrl(d1[0]);

  // 2. Strip a trailing numeric ID (old format like "business-name-city-state-15939")
  const stripped = stripTrailingNumericId(slug);
  if (stripped !== slug) {
    // 2a. Exact match on the stripped slug
    const { data: d2a } = await supabase
      .from('listings')
      .select('slug, city, state')
      .eq('slug', stripped)
      .eq('is_touchless', true)
      .maybeSingle();
    if (d2a) return buildListingUrl(d2a);

    // 2b. Prefix match on the stripped slug
    const { data: d2b } = await supabase
      .from('listings')
      .select('slug, city, state')
      .like('slug', `${stripped}-%`)
      .eq('is_touchless', true)
      .limit(1);
    if (d2b?.[0]) return buildListingUrl(d2b[0]);
  }

  return null;
}

export async function getNearbyListings(listing: Listing, limit = 6): Promise<Listing[]> {
  // Distance-based nearby query using lat/lng bounding box + Haversine sort.
  // Previously this pulled "top-reviewed in same state" which surfaced listings
  // 200+ miles away (e.g. Spokane shown as nearby for Silverdale, WA).
  //
  // Strategy: expand the search radius until we get enough results, falling
  // back to the legacy state-based query if the source listing lacks lat/lng
  // (only ~1.8% of approved touchless listings).
  if (listing.latitude == null || listing.longitude == null) {
    return getNearbyListingsLegacy(listing, limit);
  }

  // Haversine distance in miles, computed from lat/lng deltas.
  // 1 degree latitude ≈ 69 miles; 1 degree longitude ≈ 69 * cos(lat) miles.
  const distanceMiles = (lat: number, lng: number) => {
    const dLat = (lat - listing.latitude!) * 69;
    const dLng = (lng - listing.longitude!) * 69 * Math.cos(listing.latitude! * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
  };

  // Try progressively larger bounding boxes until we get `limit` results.
  // Touchless washes are sparse in some areas, so 10 mi may yield 0 in rural metros.
  for (const radiusMiles of [10, 25, 50, 100]) {
    const latDelta = radiusMiles / 69;
    const lngDelta = radiusMiles / (69 * Math.cos(listing.latitude * Math.PI / 180));

    const { data } = await publicListings('id, name, slug, city, state, rating, review_count, address, hero_image, google_photo_url, street_view_url, latitude, longitude, parent_chain, hero_image_source')
      .neq('id', listing.id)
      .gte('latitude', listing.latitude - latDelta)
      .lte('latitude', listing.latitude + latDelta)
      .gte('longitude', listing.longitude - lngDelta)
      .lte('longitude', listing.longitude + lngDelta)
      .limit(limit * 4); // overfetch for filtering + sorting

    if (!data || data.length === 0) continue;

    // Sort by actual Haversine distance (bounding box catches some farther listings)
    const ranked = data
      .map((l) => ({ listing: l, distance: distanceMiles(l.latitude!, l.longitude!) }))
      .filter((r) => r.distance <= radiusMiles)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map((r) => r.listing);

    if (ranked.length >= limit || radiusMiles === 100) {
      return ranked as Listing[];
    }
  }

  // No results even at 100 mi radius — fall back to state-based query
  return getNearbyListingsLegacy(listing, limit);
}

// Legacy fallback: same-state, sorted by review count. Used when the source
// listing has no lat/lng (~1.8% of listings) or no listings exist within 100mi.
async function getNearbyListingsLegacy(listing: Listing, limit = 6): Promise<Listing[]> {
  const { data } = await publicListings('id, name, slug, city, state, rating, review_count, address, hero_image, google_photo_url, street_view_url, latitude, longitude, parent_chain, hero_image_source')
    .eq('state', listing.state)
    .neq('id', listing.id)
    .order('review_count', { ascending: false })
    .limit(limit * 3);

  if (!data || data.length === 0) return [];

  const cityMatches = data.filter((l) => l.city === listing.city);
  const otherCity = data.filter((l) => l.city !== listing.city);
  const combined = [...cityMatches, ...otherCity].slice(0, limit);
  return combined as Listing[];
}

export async function getChainListings(listing: Listing, limit = 6): Promise<{ chainName: string | null; listings: Listing[] }> {
  if (!listing.vendor_id) return { chainName: null, listings: [] };

  const [vendorResult, listingsResult] = await Promise.all([
    supabase.from('vendors').select('canonical_name').eq('id', listing.vendor_id).single(),
    publicListings('id, name, slug, city, state, rating, review_count, address, hero_image, google_photo_url, street_view_url, parent_chain, hero_image_source')
      .eq('vendor_id', listing.vendor_id)
      .neq('id', listing.id)
      .order('review_count', { ascending: false })
      .limit(limit * 3),
  ]);

  const chainName = vendorResult.data?.canonical_name ?? null;
  const data = listingsResult.data ?? [];

  // Prioritize same state, then other states
  const sameState = data.filter((l) => l.state === listing.state);
  const otherState = data.filter((l) => l.state !== listing.state);
  return { chainName, listings: [...sameState, ...otherState].slice(0, limit) as Listing[] };
}

export async function getVerificationStats(listingId: string): Promise<VerificationStats> {
  const { data } = await supabase
    .from('listing_verifications')
    .select('is_touchless, comment, created_at')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = data || [];
  const yesCount = rows.filter(r => r.is_touchless === true).length;
  const noCount = rows.filter(r => r.is_touchless === false).length;
  const recentComments = rows.filter(r => r.comment).slice(0, 5);

  return { yesCount, noCount, recentComments };
}

export async function getReviewSnippets(listingId: string): Promise<ReviewSnippet[]> {
  const { data } = await supabase
    .from('review_snippets')
    .select('*')
    .eq('listing_id', listingId)
    .eq('is_touchless_evidence', true)
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(50);

  return (data || []) as ReviewSnippet[];
}

/**
 * Snippets that feed the Paint-Safe evidence drawer: touchless-confirmation
 * reviews + paint-relevant reviews (Haiku-labeled). Brush-attributed paint
 * complaints (paint_about_touchless='brush') are excluded so the touchless
 * wash isn't blamed for a brush-bay scratch. Mapped to the component's shape.
 */
// Defense-in-depth: some mining scripts historically stored internal keyword
// aggregates (e.g. 'Google Maps "mentioned in reviews" aggregates: touch_free=4')
// in review_text, which then rendered as fake "Google reviewer" quotes. The bad
// rows were purged 2026-06-06, but this guard keeps any future diagnostic strings
// out of the public-facing snippet sections regardless of source.
export function isRealCustomerSnippet(r: ReviewSnippet): boolean {
  const src = r.source || '';
  if (/aggregates?$/i.test(src)) return false;
  const txt = r.review_text || '';
  if (/mentioned in reviews"?\s+aggregates:/i.test(txt)) return false;
  if (/^[A-Z_]+_AGGREGATES:/i.test(txt)) return false;
  return true;
}

export async function getPaintModuleSnippets(listingId: string): Promise<PaintSnippet[]> {
  const { data } = await supabase
    .from('review_snippets')
    .select('*')
    .eq('listing_id', listingId)
    .or('is_touchless_evidence.eq.true,paint_relevant.eq.true')
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(60);
  const rows = (data || []) as ReviewSnippet[];
  const out: PaintSnippet[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.review_text || !isRealCustomerSnippet(r)) continue;
    const isPaint = r.paint_relevant === true && r.paint_about_touchless !== 'brush';
    const theme: PaintTheme = isPaint ? 'paint' : r.is_touchless_evidence ? 'touchless' : 'other';
    if (theme === 'other') continue; // drop brush-only / unrelated snippets
    // Paint snippets need enough text to be a meaningful read; short genuine
    // touchless confirmations (e.g. "Wash is touchless. Very nice") are valid
    // evidence and must not be filtered out by a paint-oriented length floor.
    const minLen = theme === 'paint' ? 40 : 12;
    if (r.review_text.length < minLen) continue;
    // Dedup identical quotes mined from multiple sources (gmaps + dataforseo etc.)
    const dedupKey = r.review_text.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const sentiment = (isPaint ? r.paint_sentiment : r.sentiment) ?? 'neutral';
    out.push({
      id: r.id,
      theme,
      sentiment: sentiment as 'positive' | 'negative' | 'neutral',
      text: r.review_text,
      reviewerName: r.reviewer_name,
      credentials: r.reviewer_credentials ?? null,
      isLocalGuide: !!r.reviewer_is_local_guide,
      rating: r.rating,
      date: r.review_date,
      recencyDays: null,
    });
  }
  return out;
}

/**
 * A balanced, honest sample of general (non-touchless-evidence) customer reviews
 * for the "More Customer Reviews" section. Shows mostly positive reviews plus a
 * couple of genuine critical ones, each rendered with its real sentiment badge,
 * so visitors see a representative picture rather than a cherry-picked one.
 *
 * Excluded: neutral/off-topic reviews (the sentiment classifier already buckets
 * gas-station/food/lukewarm reviews as 'neutral'), and reviews that dispute the
 * touchless classification — those are confusing under a wash we've verified as
 * touchless and are already handled by the community-verification widget.
 *
 * The section is anchored by positive reviews: if a listing has none, we render
 * nothing rather than a negative-only block (the main rating already reflects
 * dissatisfaction). Critical reviews are included only as the minority view.
 */
export async function getGenericReviews(listingId: string, limit = 6): Promise<ReviewSnippet[]> {
  const { data } = await supabase
    .from('review_snippets')
    .select('*')
    .eq('listing_id', listingId)
    .eq('is_touchless_evidence', false)
    .in('sentiment', ['positive', 'negative'])
    .not('rating', 'is', null)
    .order('iso_date', { ascending: false, nullsFirst: false });

  const rows = (data || []) as ReviewSnippet[];

  // Drop reviews arguing the wash isn't really touchless.
  const disputesTouchless = (t: string) =>
    /touch/i.test(t) &&
    /(not|isn.?t|wasn.?t|aren.?t)\s+(really\s+|actually\s+)?touch|touched my (car|vehicle)|strips?\s+touch|brush(es)?\s+touch|anything\s+touch/i.test(t);
  const eligible = rows.filter((r) => r.review_text && !disputesTouchless(r.review_text));

  const positives = eligible.filter((r) => r.sentiment === 'positive' && (r.rating ?? 0) >= 4);
  if (positives.length === 0) return [];

  const critical = eligible.filter((r) => r.sentiment === 'negative');
  const maxCritical = Math.min(2, critical.length, Math.max(0, limit - 2));
  const chosen = [
    ...positives.slice(0, limit - maxCritical),
    ...critical.slice(0, maxCritical),
  ];
  return chosen.slice(0, limit);
}

export async function getCityScoreRanking(state: string, city: string): Promise<ScoreRankItem[]> {
  const { data } = await publicListings('id, name, slug, city, state, touchless_satisfaction_score')
    .eq('state', state)
    .ilike('city', city)
    .not('touchless_satisfaction_score', 'is', null)
    .order('touchless_satisfaction_score', { ascending: false })
    .limit(8);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    city: r.city as string,
    state: r.state as string,
    score: r.touchless_satisfaction_score as number,
  }));
}

/**
 * Active equipment-wash videos (the "See a Touchless Wash in Action" pool),
 * managed at /admin/videos. Returns them in admin-defined order; the
 * TouchlessVideo component deterministically picks one by listing id.
 */
export async function getEquipmentVideos(): Promise<{ id: string; title: string; brand: string | null }[]> {
  const { data } = await supabase
    .from('equipment_videos')
    .select('youtube_id,title,brand_slug')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return (data || []).map((v) => ({ id: v.youtube_id as string, title: v.title as string, brand: (v.brand_slug as string) ?? null }));
}

/**
 * Count of touchless-evidence review_snippets for this listing. Used by
 * isThinListing to gate indexing of chain listings — ≥1 customer
 * confirmation that the wash IS touchless unlocks the page. We count
 * only touchless-evidence snippets because (a) those are the only
 * snippets we display to users, and (b) those are the only snippets the
 * description generator paraphrases from.
 */
export async function getReviewSnippetCount(listingId: string): Promise<number> {
  const { count } = await supabase
    .from('review_snippets')
    .select('*', { count: 'exact', head: true })
    .eq('listing_id', listingId)
    .eq('is_touchless_evidence', true);
  return count ?? 0;
}

// ── Best Of Rankings ──────────────────────────────────────────────────

export interface BestOfRanking {
  metro_slug: string;
  metro_name: string;
  rank: number;
  score: number;
  computed_at: string | null;
}

export const getBestOfRankings = cache(async (listingId: string): Promise<BestOfRanking[]> => {
  const { data } = await supabase
    .from('best_of_rankings')
    .select('metro_slug, metro_name, rank, score, computed_at')
    .eq('listing_id', listingId)
    .order('rank', { ascending: true });

  return (data || []) as BestOfRanking[];
});

/**
 * Fetch the OTHER top-ranked listings in the same metro as the current listing.
 * Used by the "More Top-Ranked Touchless Washes in [Metro]" section on listing
 * detail pages — gives comparison-shopping users multiple inline click targets,
 * driving PV/session up beyond what a single /best/ CTA could.
 *
 * Returns each sibling listing paired with its rank, ordered by rank.
 */
export const getMetroSiblingRankings = cache(async (
  metroSlug: string,
  excludeListingId: string,
  limit: number = 5,
): Promise<Array<{ listing: Listing; rank: number }>> => {
  // Pull top-ranked listing IDs in the metro (excluding current)
  const { data: rankRows } = await supabase
    .from('best_of_rankings')
    .select('listing_id, rank')
    .eq('metro_slug', metroSlug)
    .neq('listing_id', excludeListingId)
    .order('rank', { ascending: true })
    .limit(limit);

  if (!rankRows || rankRows.length === 0) return [];

  const ids = rankRows.map(r => r.listing_id as string);
  const { data: listings } = await publicListings('id, name, slug, city, state, address, phone, rating, review_count, hero_image, google_photo_url, street_view_url, logo_photo, google_logo_url, amenities, touchless_wash_types, hours, is_touchless, is_featured, is_claimed, touchless_verified, parent_chain, touchless_satisfaction_score')
    .in('id', ids);

  if (!listings) return [];

  // Preserve the rank order
  const byId = new Map((listings as unknown as Listing[]).map(l => [l.id, l]));
  return rankRows
    .map(r => {
      const listing = byId.get(r.listing_id as string);
      return listing ? { listing, rank: r.rank as number } : null;
    })
    .filter((x): x is { listing: Listing; rank: number } => x !== null);
});
