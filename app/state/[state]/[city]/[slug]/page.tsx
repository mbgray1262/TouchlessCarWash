import { cache } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import nextDynamic from 'next/dynamic';
import { notFound, redirect, permanentRedirect } from 'next/navigation';
import {
  Star, MapPin, Phone, Globe, Clock, CheckCircle, ArrowLeft,
  Sparkles, ExternalLink, ChevronRight, Navigation, HelpCircle,
  CalendarCheck, ChevronDown, Droplet, CreditCard, Zap, MessageSquareQuote, Quote, Trophy, ShieldCheck,
  ThumbsUp, ThumbsDown, Minus, Gauge
} from 'lucide-react';
import LogoImage from '@/components/LogoImage';
import HeroImageFallback from '@/components/HeroImageFallback';
import PhotoGalleryGrid from '@/components/PhotoGalleryGrid';
import SuggestEditModal from '@/components/SuggestEditModal';
import VerificationPrompt, { type VerificationStats } from '@/components/VerificationPrompt';
import { TrackableLink } from '@/components/TrackableLink';
import { HoursStatusBadge } from '@/components/HoursStatusBadge';
import { ListingBreadcrumb } from '@/components/ListingBreadcrumb';
import { RelatedReading } from '@/components/RelatedReading';
import { ProductGrid } from '@/components/ProductGrid';
import { ProductSidebar } from '@/components/ProductSidebar';
import { SavingsCalculator } from '@/components/SavingsCalculator';
import { TouchlessVideo } from '@/components/TouchlessVideo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase, type Listing, type ReviewSnippet } from '@/lib/supabase';
import PaintSafeModule, { type PaintSnippet, type PaintTheme } from '@/components/PaintSafeModule';
import TouchlessSatisfactionGauge, { type TssSnippet } from '@/components/TouchlessSatisfactionGauge';
import { TouchlessScoreComparison, type ScoreRankItem } from '@/components/TouchlessScoreComparison';
import { tssTier } from '@/lib/touchless-satisfaction';
import { US_STATES, getStateName, getStateSlug, slugify } from '@/lib/constants';
import { getAnyCityCoords, findNearestTouchlessCityPath } from '@/lib/geo-fallback';
import { streetAddress, hasStreetAddress } from '@/lib/utils';
import { DEFAULT_OG_IMAGE, ensureHttps, truncateDescription } from '@/lib/seo';
import { getChainBrandImage } from '@/lib/chain-brand-images';
import { getDisplayImage } from '@/lib/listing-image';
import { isThinListing } from '@/lib/listing-quality';
import { getOfficialStreetViewUrl, buildPlacePageUrl } from '@/lib/streetview-link';


import type { Metadata } from 'next';

const ListingMap = nextDynamic(() => import('@/components/ListingMap'), { ssr: false });

// Force dynamic rendering — no ISR cache layer. Netlify CDN handles edge caching
// and purgeCache() reliably clears it when admins make edits.
export const dynamic = 'force-dynamic';

const SITE_URL = 'https://touchlesscarwashfinder.com';

interface ListingPageProps {
  params: {
    state: string;
    city: string;
    slug: string;
  };
}

function getStateCode(stateSlug: string): string | null {
  const state = US_STATES.find((s) => slugify(s.name) === stateSlug);
  return state ? state.code : null;
}


async function getListing(slug: string): Promise<Listing | null> {
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
function buildListingUrl(match: { slug: string; city: string; state: string }): string {
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
async function findListingByPartialSlug(slug: string): Promise<string | null> {
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

async function getNearbyListings(listing: Listing, limit = 6): Promise<Listing[]> {
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

    const { data } = await supabase
      .from('listings')
      .select('id, name, slug, city, state, rating, review_count, address, hero_image, google_photo_url, street_view_url, latitude, longitude')
      .eq('is_touchless', true)
      .eq('is_approved', true)
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
  const { data } = await supabase
    .from('listings')
    .select('id, name, slug, city, state, rating, review_count, address, hero_image, google_photo_url, street_view_url, latitude, longitude')
    .eq('is_touchless', true)
    .eq('is_approved', true)
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

async function getChainListings(listing: Listing, limit = 6): Promise<{ chainName: string | null; listings: Listing[] }> {
  if (!listing.vendor_id) return { chainName: null, listings: [] };

  const [vendorResult, listingsResult] = await Promise.all([
    supabase.from('vendors').select('canonical_name').eq('id', listing.vendor_id).single(),
    supabase
      .from('listings')
      .select('id, name, slug, city, state, rating, review_count, address, hero_image, google_photo_url, street_view_url')
      .eq('is_touchless', true)
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

async function getVerificationStats(listingId: string): Promise<VerificationStats> {
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

async function getReviewSnippets(listingId: string): Promise<ReviewSnippet[]> {
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
async function getPaintModuleSnippets(listingId: string): Promise<PaintSnippet[]> {
  const { data } = await supabase
    .from('review_snippets')
    .select('*')
    .eq('listing_id', listingId)
    .or('is_touchless_evidence.eq.true,paint_relevant.eq.true')
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(60);
  const rows = (data || []) as ReviewSnippet[];
  const out: PaintSnippet[] = [];
  for (const r of rows) {
    if (!r.review_text || r.review_text.length < 40) continue;
    const isPaint = r.paint_relevant === true && r.paint_about_touchless !== 'brush';
    const theme: PaintTheme = isPaint ? 'paint' : r.is_touchless_evidence ? 'touchless' : 'other';
    if (theme === 'other') continue; // drop brush-only / unrelated snippets
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
async function getGenericReviews(listingId: string, limit = 6): Promise<ReviewSnippet[]> {
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

/**
 * Active equipment-wash videos (the "See a Touchless Wash in Action" pool),
 * managed at /admin/videos. Returns them in admin-defined order; the
 * TouchlessVideo component deterministically picks one by listing id.
 */
async function getCityScoreRanking(state: string, city: string): Promise<ScoreRankItem[]> {
  const { data } = await supabase
    .from('listings')
    .select('id, name, slug, city, state, touchless_satisfaction_score')
    .eq('is_touchless', true)
    .eq('is_approved', true)
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

async function getEquipmentVideos(): Promise<{ id: string; title: string; brand: string | null }[]> {
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
async function getReviewSnippetCount(listingId: string): Promise<number> {
  const { count } = await supabase
    .from('review_snippets')
    .select('*', { count: 'exact', head: true })
    .eq('listing_id', listingId)
    .eq('is_touchless_evidence', true);
  return count ?? 0;
}

// ── Best Of Rankings ──────────────────────────────────────────────────

interface BestOfRanking {
  metro_slug: string;
  metro_name: string;
  rank: number;
  score: number;
}

const getBestOfRankings = cache(async (listingId: string): Promise<BestOfRanking[]> => {
  const { data } = await supabase
    .from('best_of_rankings')
    .select('metro_slug, metro_name, rank, score')
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
const getMetroSiblingRankings = cache(async (
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
  const { data: listings } = await supabase
    .from('listings')
    .select('id, name, slug, city, state, address, phone, rating, review_count, hero_image, google_photo_url, street_view_url, logo_photo, google_logo_url, amenities, touchless_wash_types, hours, is_touchless, is_featured, is_claimed, touchless_verified, parent_chain')
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

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const listing = await getListing(params.slug);
  if (!listing) return { title: 'Listing Not Found', robots: { index: false, follow: false } };

  // Listing exists but was reverted (not touchless) or never approved.
  // The page render path 308-redirects to /state/<state>/<city>; this is
  // the metadata path Google might still use if it caches the URL during
  // a re-crawl window. Make sure that cached metadata says noindex so the
  // URL drops out of "Duplicate without user-selected canonical" reports.
  if (!listing.is_touchless || !listing.is_approved) {
    return {
      title: 'Listing Not Available',
      robots: { index: false, follow: true },
    };
  }

  const stateCode = getStateCode(params.state);
  const stateName = stateCode ? getStateName(stateCode) : listing.state;
  const topAmenities = (listing.amenities || []).slice(0, 3).join(', ');
  const amenityPart = topAmenities ? ` Touch-free, brushless car wash offering ${topAmenities}.` : '';
  // Canonical city slug uses slugify() to strip apostrophes & other non-
  // alphanumeric chars, so Google never sees /coeur-d'alene/... and
  // /coeur-dalene/... as competing URLs for the same listing.
  const canonicalCitySlug = slugify(listing.city) || params.city;
  const canonicalUrl = `${SITE_URL}/state/${params.state}/${canonicalCitySlug}/${params.slug}`;
  // Location-specific admin-curated photos ALWAYS beat the generic chain brand image.
  // The brand image is only the fallback when we don't have a human-verified hero.
  // ('chain-brand-auto', 'google-auto', 'streetview-auto', etc. are machine-assigned and
  //  should be replaced by brand image for chain locations.)
  const rawHeroImage = getDisplayImage(listing, { allowStreetView: true });
  const heroImage = rawHeroImage ? ensureHttps(rawHeroImage) : null;
  const ogImages = heroImage
    ? [{ url: heroImage, width: 1200, height: 630, alt: listing.name }]
    : [DEFAULT_OG_IMAGE];

  // Check for Best Of rankings (top 3 in a metro area)
  const rankings = await getBestOfRankings(listing.id);
  const topRanking = rankings.length > 0 ? rankings[0] : null; // Use the best (lowest) rank

  // Title CTR optimization:
  //   - Lead with ★ rating prefix when available (proven CTR booster in SERPs)
  //   - Drop "& Brushless" to make room — keyword is redundant with "Touchless"
  //   - Ranked listings keep the "#N Best" authority signal
  const titleRatingPrefix = listing.rating > 0
    ? `★ ${Number(listing.rating).toFixed(1)} `
    : '';
  const title = topRanking
    ? `#${topRanking.rank} Best Touchless Car Wash in ${topRanking.metro_name} | ${listing.name}`
    : `${titleRatingPrefix}${listing.name} | Touchless Car Wash in ${listing.city}, ${listing.state}`;
  const ogTitle = topRanking
    ? `#${topRanking.rank} Best Touchless Car Wash in ${topRanking.metro_name} | ${listing.name}`
    : `${titleRatingPrefix}${listing.name} | Touchless Car Wash in ${listing.city}, ${stateName}`;

  // Lead with star rating for CTR — Google often shows this in snippet
  const ratingPrefix = listing.rating > 0
    ? `★ ${Number(listing.rating).toFixed(1)}${listing.review_count > 0 ? ` (${listing.review_count} reviews)` : ''} — `
    : '';
  const rankingPrefix = topRanking ? `#${topRanking.rank} Best Touchless & Brushless Car Wash in ${topRanking.metro_name}. ` : '';
  const description = truncateDescription(
    `${ratingPrefix}${rankingPrefix}${listing.name} at ${streetAddress(listing.address, listing.city, listing.state, listing.zip)}, ${listing.city}, ${listing.state}.${amenityPart} Hours, directions & more.`
  );

  // Thin listings (true ghosts OR chain locations without unique per-
  // location signals) are excluded from Google's index so they stop
  // dragging down the site-wide quality signal and stop triggering
  // "scaled content" flags during AdSense review. They remain visible
  // on city/state hub pages — only the standalone detail page URL is
  // hidden from search results. See lib/listing-quality.ts for the
  // exact criteria.
  const reviewSnippetCount = listing.parent_chain
    ? await getReviewSnippetCount(listing.id)
    : 0; // Only matters for chain listings; non-chain can skip this query.
  const thin = isThinListing({ ...listing, review_snippet_count: reviewSnippetCount });
  const robots = thin ? { index: false, follow: true } : undefined;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalUrl },
    ...(robots ? { robots } : {}),
    openGraph: {
      title: ogTitle,
      description,
      url: canonicalUrl,
      type: 'website',
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      ...(heroImage ? { images: [heroImage] } : {}),
    },
  };
}

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

function getTodayKey(): string {
  return DAY_ORDER[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
}

/** Hostnames configured in next.config.js remotePatterns — safe for next/image optimization. */
const OPTIMIZED_HOSTS = new Set([
  'gteqijdpqjmgxfnyuhvy.supabase.co',
  'res.cloudinary.com',
  'lh3.googleusercontent.com',
  'streetviewpixels-pa.googleapis.com',
  'places.googleapis.com',
  'maps.googleapis.com',
]);

function isOptimizedImageHost(url: string): boolean {
  try {
    return OPTIMIZED_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isImageUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  // Google Places photo URLs don't have file extensions — allow them explicitly
  if (lower.includes('places.googleapis.com') && lower.includes('/photos/')) return true;
  if (lower.includes('maps.googleapis.com')) return true;
  return (
    lower.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)(\?.*)?$/) !== null &&
    !lower.includes('icon') &&
    !lower.includes('logo') &&
    !lower.includes('favicon')
  );
}

function parseTimeToMinutes(timeStr: string): number | null {
  const clean = timeStr.trim().toUpperCase();
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2] || '0', 10);
  const period = match[3];
  if (period === 'AM' && hours === 12) hours = 0;
  if (period === 'PM' && hours !== 12) hours += 12;
  return hours * 60 + mins;
}

function getOpenStatus(hours: Record<string, string> | null): 'open' | 'closed' | null {
  if (!hours) return null;
  const todayKey = getTodayKey();
  const todayHours = hours[todayKey];
  if (!todayHours) return 'closed';
  if (todayHours.toLowerCase().includes('24') || todayHours.toLowerCase().includes('open 24')) return 'open';
  const parts = todayHours.split(/[-–]/);
  if (parts.length !== 2) return null;
  const openMins = parseTimeToMinutes(parts[0].trim());
  const closeMins = parseTimeToMinutes(parts[1].trim());
  if (openMins === null || closeMins === null) return null;
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  if (closeMins < openMins) {
    return currentMins >= openMins || currentMins < closeMins ? 'open' : 'closed';
  }
  return currentMins >= openMins && currentMins < closeMins ? 'open' : 'closed';
}

/** Short 1-2 sentence description for the hero banner (line-clamped to 2 lines). */
function buildHeroDescription(listing: Listing): string {
  // Prefer google_description — it's naturally short (1-2 sentences from Google editorial summary)
  if (listing.google_description) return listing.google_description;

  // If we have a full description, extract just the first sentence for the hero
  if (listing.description) {
    const firstSentence = listing.description.split(/(?<=[.!?])\s+/)[0];
    if (firstSentence && firstSentence.length <= 200) return firstSentence;
    return listing.description.substring(0, 180).replace(/\s+\S*$/, '') + '…';
  }

  // Fallback: build from city/state and amenities
  const parts: string[] = [`Touchless, touch-free car wash in ${listing.city}, ${listing.state}`];
  const highlights = (listing.amenities || []).slice(0, 4);
  if (highlights.length > 0) {
    parts.push(`offering ${highlights.map((a) => a.toLowerCase()).join(', ')}, and more`);
  }
  return parts.join(' ') + '.';
}

const WASH_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  touchless_automatic: { label: 'Touchless Automatic', color: 'bg-blue-100 text-blue-800 border-blue-200' },
};

// Brand labels imported from centralized equipment data
import { getBrandLabel, getBrandBySlug, slugifyModel } from '@/lib/equipment-data';

function buildLocalBusinessSchema(listing: Listing, canonicalUrl: string, hours: Record<string, string> | null, reviewSnippets: ReviewSnippet[] = [], rankings: BestOfRanking[] = []): object {
  const hoursSpec = hours
    ? DAY_ORDER.filter((d) => hours[d]).map((day) => {
        const val = hours[day];
        const parts = val.split(/[-–]/);
        if (val.toLowerCase().includes('24')) {
          return { '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${day.charAt(0).toUpperCase() + day.slice(1)}`, opens: '00:00', closes: '23:59' };
        }
        if (parts.length === 2) {
          return { '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${day.charAt(0).toUpperCase() + day.slice(1)}`, opens: convertTo24h(parts[0].trim()), closes: convertTo24h(parts[1].trim()) };
        }
        return null;
      }).filter(Boolean)
    : [];

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'AutoWash',
    name: listing.name,
    url: canonicalUrl,
    telephone: listing.phone ?? undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: listing.address,
      addressLocality: listing.city,
      addressRegion: listing.state,
      postalCode: listing.zip,
      addressCountry: 'US',
    },
  };

  if (listing.latitude && listing.longitude) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: listing.latitude,
      longitude: listing.longitude,
    };
  }

  if (hoursSpec.length > 0) schema.openingHoursSpecification = hoursSpec;

  if (listing.rating > 0 && listing.review_count > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(listing.rating).toFixed(1),
      reviewCount: listing.review_count,
      bestRating: '5',
      worstRating: '1',
    };
  }

  const chainBrandImageSchema = listing.hero_image_source !== 'manual'
    ? getChainBrandImage(listing.parent_chain, listing.id) : null;
  const heroImage = chainBrandImageSchema ?? listing.hero_image ?? listing.google_photo_url ?? null;
  if (heroImage) schema.image = heroImage;
  if (listing.price_range) schema.priceRange = listing.price_range;
  if (listing.website) schema.sameAs = listing.website;

  // Add individual reviews from snippets for rich results
  // Only include reviews when aggregateRating is also present — Google requires
  // aggregateRating whenever multiple Review objects are present, otherwise it
  // flags the structured data as invalid.
  if (reviewSnippets.length > 0 && schema.aggregateRating) {
    schema.review = reviewSnippets.map((snippet) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: snippet.reviewer_name || 'Anonymous' },
      reviewBody: snippet.review_text,
      ...(snippet.rating ? { reviewRating: { '@type': 'Rating', ratingValue: snippet.rating, bestRating: 5 } } : {}),
      ...(snippet.iso_date ? { datePublished: snippet.iso_date } : {}),
    }));
  }

  // Add awards from Best Of rankings
  if (rankings.length > 0) {
    const year = new Date().getFullYear();
    schema.award = rankings.map(
      (r) => `#${r.rank} Best Touchless Car Wash in ${r.metro_name} (${year})`,
    );
  }

  return schema;
}

function buildBreadcrumbSchema(items: { name: string; url: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// Safely coerce extracted_data fields that may be a string instead of an array
/**
 * Normalize an extracted_data field to a string[] — strings pass through;
 * objects shaped like {name, details, options} (some listings have these
 * for special_features / amenities_detailed) get reduced to their `name`
 * so we don't render a raw object as a React child and crash the page.
 * Anything else is dropped.
 */
function asArray(val: unknown): string[] {
  const toStr = (v: unknown): string | null => {
    if (typeof v === 'string') return v.trim() ? v : null;
    if (v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string') {
      const name = (v as { name: string }).name;
      return name.trim() ? name : null;
    }
    return null;
  };
  if (Array.isArray(val)) {
    return val.map(toStr).filter((s): s is string => s !== null);
  }
  const single = toStr(val);
  return single ? [single] : [];
}

function parsePrice(raw: unknown): number | null {
  const m = String(raw ?? '').match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Pull only monthly-priced unlimited/membership plans for the savings calculator.
function monthlyMemberships(listing: Listing): { name: string; price: number }[] {
  const plans = Array.isArray(listing.extracted_data?.membership_plans)
    ? listing.extracted_data!.membership_plans
    : [];
  return plans
    .filter((p) => /month|\/mo\b|monthly/i.test(String(p.price ?? '')))
    .map((p) => ({ name: p.name, price: parsePrice(p.price) }))
    .filter((p): p is { name: string; price: number } => p.price !== null && p.price < 200)
    .slice(0, 8);
}

// Representative single-wash price (median of priced wash packages) to pre-fill
// the calculator; falls back to a neutral $15 the user can edit.
function defaultWashPrice(listing: Listing): number {
  const prices = (listing.wash_packages || [])
    .map((p) => parsePrice(p.price))
    .filter((n): n is number => n !== null && n < 100)
    .sort((a, b) => a - b);
  if (prices.length === 0) return 15;
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return Math.round(median);
}

function buildFAQs(listing: Listing, hours: Record<string, string> | null): { q: string; a: string }[] {
  const faqs: { q: string; a: string }[] = [];

  // 1. Is this a touchless car wash? (always shown) — enriched with wash types & equipment
  let touchlessAnswer = `Yes, ${listing.name} in ${listing.city}, ${listing.state} is a verified touchless (brushless) car wash — also known as a touch-free or no-touch wash — that cleans your vehicle using high-pressure water and detergents without physical contact.`;
  if (listing.touchless_wash_types && listing.touchless_wash_types.length > 0) {
    const typeLabels = listing.touchless_wash_types.map((wt) => WASH_TYPE_LABELS[wt]?.label || wt);
    touchlessAnswer += ` Wash types available: ${typeLabels.join(' and ')}.`;
  }
  if (listing.equipment_brand) {
    const brandLabel = listing.equipment_model || getBrandLabel(listing.equipment_brand) || listing.equipment_brand;
    touchlessAnswer += ` They use ${brandLabel} touchless wash equipment.`;
  }
  faqs.push({ q: `Is ${listing.name} a touchless car wash?`, a: touchlessAnswer });

  // 2. Hours (conditional)
  if (hours && Object.keys(hours).length > 0) {
    const todayKey = getTodayKey();
    const todayLabel = DAY_LABELS[todayKey];
    const todayHours = hours[todayKey];
    const hoursSummary = DAY_ORDER.filter((d) => hours[d]).map((d) => `${DAY_LABELS[d]}: ${hours[d]}`).join(' | ');
    let hoursNote = '';
    const hoursNotes = asArray(listing.extracted_data?.hours_notes);
    if (hoursNotes.length > 0) {
      hoursNote = ` Note: ${hoursNotes.join(' ')}`;
    }
    faqs.push({
      q: `What are the hours for ${listing.name}?`,
      a: `${listing.name} hours: ${hoursSummary}.${todayHours ? ` Today (${todayLabel}): ${todayHours}.` : ''}${hoursNote}`,
    });
  }

  // 3. Pricing (always shown) — enriched with membership plans
  let pricingAnswer = '';
  if (listing.wash_packages && listing.wash_packages.length > 0) {
    pricingAnswer = `Available wash packages: ${listing.wash_packages.map((p) => p.name + (p.price ? ` (${p.price})` : '')).join(', ')}.`;
  } else {
    pricingAnswer = `Pricing varies by wash package. ${listing.phone ? `Contact them at ${listing.phone} or visit` : 'Visit'} their website for current prices.`;
  }
  const membershipPlans = Array.isArray(listing.extracted_data?.membership_plans) ? listing.extracted_data!.membership_plans : [];
  if (membershipPlans.length > 0) {
    const planNames = membershipPlans.map((p) => p.name + (p.price ? ` (${p.price})` : '')).join(', ');
    pricingAnswer += ` Unlimited wash memberships are also available: ${planNames}.`;
  }
  faqs.push({ q: `How much does ${listing.name} cost?`, a: pricingAnswer });

  // 4. Membership plans (conditional — only if extracted)
  if (membershipPlans.length > 0) {
    const planDetails = membershipPlans.map((p) => {
      let detail = p.name;
      if (p.price) detail += ` at ${p.price}/month`;
      if (p.features && p.features.length > 0) detail += ` — includes ${p.features.slice(0, 3).join(', ')}`;
      return detail;
    }).join('; ');
    faqs.push({
      q: `Does ${listing.name} offer unlimited wash memberships?`,
      a: `Yes, ${listing.name} offers unlimited wash membership plans: ${planDetails}. Memberships provide great value for frequent washers.`,
    });
  }

  // 5. Amenities (conditional)
  if (listing.amenities && listing.amenities.length > 0) {
    faqs.push({
      q: `What amenities does ${listing.name} offer?`,
      a: `${listing.name} offers the following amenities: ${listing.amenities.join(', ')}.`,
    });
  }

  // 6. Equipment & technology (conditional)
  const tech = asArray(listing.extracted_data?.equipment_technology);
  if (listing.equipment_brand || tech.length > 0) {
    const brandLabel = listing.equipment_brand ? (getBrandLabel(listing.equipment_brand) || listing.equipment_brand) : null;
    const model = listing.equipment_model;
    let equipAnswer = `${listing.name} uses `;
    if (model) {
      equipAnswer += model;
    } else if (brandLabel) {
      equipAnswer += `${brandLabel} touchless wash equipment`;
    } else {
      equipAnswer += 'professional touchless wash equipment';
    }
    if (tech.length > 0) {
      equipAnswer += `, featuring ${tech.join(', ')}`;
    }
    equipAnswer += '. This touch-free technology ensures a scratch-free, brushless wash every time.';
    faqs.push({ q: `What equipment does ${listing.name} use?`, a: equipAnswer });
  }

  // 7. Service types (conditional — only if extracted)
  const serviceTypes = asArray(listing.extracted_data?.service_types);
  if (serviceTypes.length > 0) {
    faqs.push({
      q: `What types of car wash services does ${listing.name} offer?`,
      a: `${listing.name} offers the following services: ${serviceTypes.join(', ')}. All washes are touchless and touch-free — no brushes or cloth touch your vehicle.`,
    });
  }

  // 8. Payment methods (conditional — only if extracted)
  const paymentMethods = asArray(listing.extracted_data?.payment_methods);
  if (paymentMethods.length > 0) {
    faqs.push({
      q: `What payment methods does ${listing.name} accept?`,
      a: `${listing.name} accepts the following payment methods: ${paymentMethods.join(', ')}.`,
    });
  }

  // 9. Special features (conditional — only if extracted)
  const specialFeatures = asArray(listing.extracted_data?.special_features);
  if (specialFeatures.length > 0) {
    faqs.push({
      q: `What special features does ${listing.name} have?`,
      a: `${listing.name} offers these special features: ${specialFeatures.join(', ')}. These extras make it a standout among touchless car washes in ${listing.city}.`,
    });
  }

  // 10. Safe for luxury vehicles (always shown — high-value ad keyword content)
  faqs.push({
    q: `Is ${listing.name} safe for Tesla, BMW, and luxury vehicles?`,
    a: `Yes. ${listing.name} is a touchless car wash, meaning no brushes or cloth ever contact your vehicle. This makes it the safest automated wash option for luxury and high-end vehicles including Tesla Model 3, Model Y, and Model S, BMW, Mercedes-Benz, Lexus, Audi, Porsche, Range Rover, and Genesis. Touchless washes are also recommended by auto detailing professionals for cars with ceramic coatings, paint protection film (PPF), vinyl wraps, or any premium paint finish.`,
  });

  // 11. Location (always shown)
  faqs.push({
    q: `Where is ${listing.name} located?`,
    a: `${listing.name} is located at ${streetAddress(listing.address, listing.city, listing.state, listing.zip)}, ${listing.city}, ${listing.state} ${listing.zip}.${listing.phone ? ` Call them at ${listing.phone}.` : ''} Get directions via Google Maps.`,
  });

  return faqs;
}

function buildFAQSchema(listing: Listing, hours: Record<string, string> | null): object {
  const faqs = buildFAQs(listing, hours);
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };
}

function convertTo24h(timeStr: string): string {
  const clean = timeStr.trim().toUpperCase();
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!match) return '00:00';
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2] || '0', 10);
  const period = match[3];
  if (period === 'AM' && h === 12) h = 0;
  if (period === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.25 && rating - full < 0.75;
  const stars = Array.from({ length: 5 }, (_, i) => {
    if (i < full) return 'full';
    if (i === full && half) return 'half';
    return 'empty';
  });
  return (
    <span className="flex items-center gap-0.5">
      {stars.map((type, i) => (
        <span key={i} className="relative inline-block w-4 h-4">
          <Star className="w-4 h-4 text-gray-300 fill-gray-300 absolute inset-0" />
          {type === 'full' && (
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 absolute inset-0" />
          )}
          {type === 'half' && (
            <span className="absolute inset-0 overflow-hidden w-[50%]">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

/**
 * Smart-truncate a review to ~maxLen chars, keeping the first keyword visible.
 * If the keyword is near the start the text is simply trimmed at the end.
 * If the keyword is buried deep, we trim from both sides and add ellipses.
 */
function smartTruncate(text: string, keywords: string[], maxLen = 280): string {
  if (text.length <= maxLen) return text;
  if (!keywords || keywords.length === 0) return text.slice(0, maxLen).trimEnd() + '…';

  // Find the earliest keyword match
  const escaped = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(escaped.join('|'), 'gi');
  const match = pattern.exec(text);

  if (!match) return text.slice(0, maxLen).trimEnd() + '…';

  const kwStart = match.index;
  const kwEnd = kwStart + match[0].length;

  // If keyword is within the first maxLen chars, just truncate the end
  if (kwEnd <= maxLen - 20) {
    return text.slice(0, maxLen).trimEnd() + '…';
  }

  // Otherwise center a window around the keyword
  const padding = Math.floor((maxLen - match[0].length) / 2);
  let start = Math.max(0, kwStart - padding);
  let end = Math.min(text.length, kwEnd + padding);

  // Snap to word boundaries
  if (start > 0) {
    const spaceAfter = text.indexOf(' ', start);
    if (spaceAfter !== -1 && spaceAfter < start + 20) start = spaceAfter + 1;
  }
  if (end < text.length) {
    const spaceBefore = text.lastIndexOf(' ', end);
    if (spaceBefore > end - 20) end = spaceBefore;
  }

  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).trim() + suffix;
}

/** Highlight touchless keywords in review text with green accent. */
function HighlightedReviewText({ text, keywords }: { text: string; keywords: string[] }) {
  if (!keywords || keywords.length === 0) return <>{text}</>;

  // Build a regex that matches any keyword (case-insensitive)
  const escaped = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');

  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = keywords.some((kw) => kw.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <mark key={i} className="bg-green-100 text-green-800 rounded px-0.5 font-medium">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null;
  if (sentiment === 'positive') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        <ThumbsUp className="w-3 h-3" />
        Positive
      </span>
    );
  }
  if (sentiment === 'negative') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        <ThumbsDown className="w-3 h-3" />
        Negative
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
      <Minus className="w-3 h-3" />
      Mixed
    </span>
  );
}

function ReviewSnippetCard({ snippet }: { snippet: ReviewSnippet }) {
  const displayText = smartTruncate(snippet.review_text, snippet.touchless_keywords);
  const borderColor = snippet.sentiment === 'positive'
    ? 'border-green-200 bg-green-50/30'
    : snippet.sentiment === 'negative'
    ? 'border-red-200 bg-red-50/30'
    : 'border-gray-100 bg-gray-50';
  return (
    <div className={`p-4 rounded-xl border ${borderColor}`}>
      <div className="flex items-start gap-3">
        <Quote className="w-5 h-5 text-[#22C55E]/40 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-700 leading-relaxed">
            <HighlightedReviewText text={displayText} keywords={snippet.touchless_keywords} />
          </p>
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
            {snippet.sentiment && <SentimentBadge sentiment={snippet.sentiment} />}
            {snippet.rating && snippet.rating > 0 && (
              <span className="flex items-center gap-0.5">
                {Array.from({ length: snippet.rating }, (_, i) => (
                  <Star key={i} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                ))}
              </span>
            )}
            <span className="text-xs text-gray-500 font-medium">
              {snippet.reviewer_name || 'Anonymous'}
            </span>
            {snippet.review_date && (
              <span className="text-xs text-gray-400">{snippet.review_date}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NearbyListingCard({ nearby, stateSlug }: { nearby: Listing; stateSlug: string }) {
  const citySlug = slugify(nearby.city);
  const thumb = nearby.hero_image ?? nearby.google_photo_url ?? nearby.street_view_url ?? null;
  return (
    <Link
      href={`/state/${stateSlug}/${citySlug}/${nearby.slug}`}
      className="group flex gap-3 p-3 rounded-xl border border-gray-200 bg-white hover:border-[#22C55E] hover:shadow-sm transition-all"
    >
      {thumb && (
        <div className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
          <Image src={thumb} alt={nearby.name} fill sizes="64px" className="object-cover group-hover:scale-105 transition-transform duration-300" unoptimized={!isOptimizedImageHost(thumb)} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[#0F2744] text-sm leading-tight group-hover:text-[#22C55E] transition-colors truncate">{nearby.name}</div>
        <div className="text-xs text-gray-500 mt-0.5 truncate">{nearby.city}, {nearby.state}</div>
        {nearby.rating > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            <span className="text-xs font-semibold text-gray-700">{Number(nearby.rating).toFixed(1)}</span>
            {nearby.review_count > 0 && <span className="text-xs text-gray-400">({nearby.review_count})</span>}
          </div>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#22C55E] shrink-0 self-center transition-colors" />
    </Link>
  );
}

export default async function ListingDetailPage({ params }: ListingPageProps) {
  const [listing] = await Promise.all([getListing(params.slug)]);

  if (!listing) {
    // Try to find a listing with a longer slug that starts with the requested slug.
    // This handles old short slugs (e.g. "rice-street-car-wash") that were replaced
    // with longer address-based slugs.
    const redirectUrl = await findListingByPartialSlug(params.slug);
    if (redirectUrl) permanentRedirect(redirectUrl); // 308 — tells Google to transfer PageRank to the new slug

    const flag = `?from=removed-listing&orig=${encodeURIComponent(params.slug)}`;
    const stateCode = getStateCode(params.state);
    if (stateCode) {
      const coords = await getAnyCityCoords(stateCode, params.city);
      if (coords) {
        const nearest = await findNearestTouchlessCityPath(coords, stateCode);
        if (nearest) permanentRedirect(`${nearest}${flag}`);
      }
    }
    permanentRedirect(`/state/${params.state}/${params.city}${flag}`);
  }

  // Listing EXISTS but is NOT a touchless wash (either never was, or was
  // reverted after re-classification). Do NOT return 404 — mass 404s on
  // previously-indexed URLs hurt site health signals (AdSense approval,
  // crawl reputation). Instead 301-redirect to the city hub page, which
  // Google treats as a normal site reorganization and which transfers
  // any accumulated PageRank to the city page.
  if (!listing.is_touchless || !listing.is_approved) {
    const stateSlug = getStateSlug(listing.state) || params.state;
    const citySlug = slugify(listing.city) || params.city;
    // Prefer the listing's own city hub (most relevant to the original
    // query), but only if that hub still has approved touchless listings.
    const { count: cityCount } = await supabase
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('state', listing.state)
      .eq('city', listing.city)
      .eq('is_touchless', true)
      .eq('is_approved', true);
    // Closed businesses get a closed-specific banner; everything else
    // (reverted-as-not-touchless, generic removal) gets the generic one.
    const cs = (listing as Listing & { classification_source?: string | null }).classification_source ?? '';
    const fromTag = cs.startsWith('closed_permanently')
      ? 'closed-permanently'
      : cs.startsWith('closed_temporarily')
        ? 'closed-temporarily'
        : 'removed-listing';
    const flag = `?from=${fromTag}&orig=${encodeURIComponent(listing.name)}`;
    if ((cityCount ?? 0) > 0) {
      permanentRedirect(`/state/${stateSlug}/${citySlug}${flag}`);
    }
    if (listing.latitude != null && listing.longitude != null) {
      const nearest = await findNearestTouchlessCityPath(
        { lat: Number(listing.latitude), lng: Number(listing.longitude) },
        listing.state,
      );
      if (nearest) permanentRedirect(`${nearest}${flag}`);
    }
    const { count: stateCount } = await supabase
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('state', listing.state)
      .eq('is_touchless', true)
      .eq('is_approved', true);
    if ((stateCount ?? 0) > 0) {
      permanentRedirect(`/state/${stateSlug}${flag}`);
    }
    permanentRedirect(`/${flag}`);
  }

  // Canonical-slug redirect: if the requested URL uses a non-canonical
  // city slug (e.g. /coeur-d'alene/... when slugify() would produce
  // /coeur-dalene/...), 308 to the canonical path so Google never indexes
  // both spellings. Fixes recurring GSC "Duplicate, Google chose
  // different canonical than user" warnings on cities with apostrophes.
  const canonicalCitySlug = slugify(listing.city);
  if (canonicalCitySlug && canonicalCitySlug !== params.city) {
    permanentRedirect(`/state/${params.state}/${canonicalCitySlug}/${params.slug}`);
  }

  const [nearbyListings, reviewSnippets, genericReviews, rankings, chainResult, verificationStats, equipmentVideos, paintSnippets, cityScoreRanking] = await Promise.all([
    getNearbyListings(listing),
    getReviewSnippets(listing.id),
    getGenericReviews(listing.id),
    getBestOfRankings(listing.id),
    getChainListings(listing),
    getVerificationStats(listing.id),
    getEquipmentVideos(),
    getPaintModuleSnippets(listing.id),
    listing.touchless_satisfaction_score != null
      ? getCityScoreRanking(listing.state, listing.city)
      : Promise.resolve([] as ScoreRankItem[]),
  ]);

  // If the current listing is ranked in a metro, fetch the OTHER top-ranked
  // washes from the same metro so we can show them inline as comparison shopping
  // targets. Skipped when not ranked — the section won't render in that case.
  const topRankingForSiblings = rankings.length > 0 ? rankings[0] : null;
  const metroSiblings = topRankingForSiblings
    ? await getMetroSiblingRankings(topRankingForSiblings.metro_slug, listing.id, 5)
    : [];

  const stateCode = getStateCode(params.state);
  const stateName = stateCode ? getStateName(stateCode) : '';
  const cityName = listing.city;
  const todayKey = getTodayKey();

  // Shared resolution: chain brand → hero → google photo → street view.
  const heroImage = getDisplayImage(listing, { allowStreetView: true });
  const logoImage = listing.logo_photo ?? listing.google_logo_url ?? null;
  const heroFocalPoint = listing.hero_focal_point ?? 'center';
  const heroObjectPosition = heroFocalPoint === 'top' ? 'center 20%' : heroFocalPoint === 'bottom' ? 'center 80%' : 'center';

  const seenUrls = new Set<string>();
  const allGalleryPhotos: string[] = [];
  const candidatePhotos = [
    ...(heroImage ? [heroImage] : []),
    ...(listing.photos || []),
    ...(listing.google_photo_url ? [listing.google_photo_url] : []),
    ...(listing.street_view_url ? [listing.street_view_url] : []),
  ];
  for (const p of candidatePhotos) {
    if (p && isImageUrl(p) && p !== logoImage && !seenUrls.has(p)) {
      seenUrls.add(p);
      allGalleryPhotos.push(p);
    }
  }

  const galleryPhotos = allGalleryPhotos.slice(0, 8);
  const hours = listing.hours as Record<string, string> | null;
  // Open/closed status is now handled client-side by HoursStatusBadge
  // to use the user's local timezone instead of the server's UTC time
  const heroDescription = buildHeroDescription(listing);

  // The canonical-slug redirect above guarantees params.city is already
  // canonical, but recompute slugify(listing.city) here for clarity and
  // to keep this string the single source of truth for the canonical URL.
  const canonicalCitySlugRender = slugify(listing.city) || params.city;
  const canonicalUrl = `${SITE_URL}/state/${params.state}/${canonicalCitySlugRender}/${params.slug}`;

  const localBusinessSchema = buildLocalBusinessSchema(listing, canonicalUrl, hours, reviewSnippets, rankings);
  const breadcrumbItems = [
    { name: 'Home', url: SITE_URL },
    { name: 'States', url: `${SITE_URL}/states` },
    { name: stateName, url: `${SITE_URL}/state/${params.state}` },
    { name: cityName, url: `${SITE_URL}/state/${params.state}/${canonicalCitySlugRender}` },
    { name: listing.name, url: canonicalUrl },
  ];
  const breadcrumbSchema = buildBreadcrumbSchema(breadcrumbItems);
  const faqs = buildFAQs(listing, hours);
  const faqSchema = buildFAQSchema(listing, hours);

  const lastVerified = listing.created_at
    ? new Date(listing.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  // Resolve a Street View URL that won't drop the visitor inside an
  // adjacent business's user-uploaded 360° interior. If Google's own
  // outdoor pano exists at this address, we link directly to its
  // pano_id; otherwise we fall back to the listing's Google Maps
  // place page (which has photos / reviews / a Street View tab the
  // user can browse manually). See lib/streetview-link.ts for why.
  const streetViewUrl = (await getOfficialStreetViewUrl(listing.latitude, listing.longitude))
    ?? buildPlacePageUrl({
      placeId: listing.google_place_id,
      address: listing.address,
      city: listing.city,
      state: listing.state,
      zip: listing.zip,
    });

  const ratingStars = listing.rating > 0 ? (
    <span className="flex items-center gap-1.5">
      <StarRating rating={listing.rating} />
      {listing.google_place_id ? (
        <a
          href={`https://search.google.com/local/reviews?placeid=${listing.google_place_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:underline underline-offset-2 decoration-white/40 transition-all"
        >
          <span className="font-semibold text-white">{Number(listing.rating).toFixed(1)}</span>
          {listing.review_count > 0 && <span className="text-white/60">({listing.review_count} reviews)</span>}
        </a>
      ) : (
        <>
          <span className="font-semibold text-white">{Number(listing.rating).toFixed(1)}</span>
          {listing.review_count > 0 && <span className="text-white/60">({listing.review_count} reviews)</span>}
        </>
      )}
    </span>
  ) : null;

  const topRanking = rankings.length > 0 ? rankings[0] : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className="min-h-screen bg-gray-50">
        <div className="relative bg-[#0F2744]">
          {heroImage ? (
            <>
              {/* Mobile keeps a fixed 320 tall (16:9 of 375px is only 211 —
                  too short for the title overlay). md+ switches to true
                  16:9 (matches the cropper's output ratio) with a 44rem
                  ceiling so the hero doesn't dominate ultra-wide monitors.
                  Previously the container was a fixed 416 tall on every
                  desktop breakpoint, which meant 16:9 hero images were
                  cropping off ~60% of vertical content on wide displays.
                  `w-full` is critical: without it, on ultrawide displays
                  the `aspect-[16/9]` + `max-h-[44rem]` pair conflict, and
                  the browser shrinks WIDTH (not height) to honor 16:9
                  under the height cap — producing a hero that only fills
                  ~65% of the screen with dark navy bg leaking through on
                  the right. Pinning w-full forces the cap to take from
                  height only, and object-cover handles the crop. */}
              <div className="relative h-80 w-full md:h-auto md:aspect-[16/9] md:max-h-[44rem] overflow-hidden">
                <Image
                  src={heroImage}
                  alt={listing.name}
                  fill
                  priority
                  sizes="100vw"
                  className="object-cover"
                  style={{ objectPosition: heroObjectPosition }}
                  unoptimized={!isOptimizedImageHost(heroImage)}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0F2744] via-[#0F2744]/50 to-[#0F2744]/10" />

                {/* Claim Your Badge — floating button on hero */}
                {topRanking && (
                  <Link
                    href={`/badge/${listing.slug}`}
                    className="absolute bottom-4 right-4 md:bottom-6 md:right-6 z-10 flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-yellow-900 font-semibold text-sm px-4 py-2.5 rounded-lg shadow-lg hover:shadow-xl transition-all"
                  >
                    <Trophy className="w-4 h-4" />
                    Claim Your Badge
                  </Link>
                )}
              </div>

              <div className="absolute inset-0 flex flex-col justify-end pointer-events-none">
                <div className="container mx-auto px-4 max-w-5xl pb-8 pt-4 pointer-events-auto">
                  <ListingBreadcrumb
                    listingName={listing.name}
                    stateSlug={params.state}
                    stateName={stateName}
                    citySlug={params.city}
                    cityName={cityName}
                    variant="hero"
                  />

                  <div className="flex items-start gap-4">
                    {logoImage && (
                      <LogoImage
                        src={logoImage}
                        alt={`${listing.name} logo`}
                        wrapperClassName="shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-white p-1.5 shadow-lg mt-1"
                        className="w-full h-full object-contain"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <Badge className="bg-[#22C55E] text-white border-0 shadow-sm">
                          <CheckCircle className="w-3 h-3 mr-1" />Touchless Verified
                        </Badge>
                        {listing.touchless_satisfaction_score != null && (
                          <Badge className="border-0 shadow-sm text-white" style={{ backgroundColor: tssTier(listing.touchless_satisfaction_score).arc }}>
                            <Gauge className="w-3 h-3 mr-1" />Touchless Satisfaction {listing.touchless_satisfaction_score}
                          </Badge>
                        )}
                        {listing.paint_safe_verified && (
                          <Badge className="bg-emerald-600 text-white border-0 shadow-sm">
                            <ShieldCheck className="w-3 h-3 mr-1" />Paint-Safe Verified
                          </Badge>
                        )}
                        {listing.is_claimed && (
                          <Badge className="bg-blue-500 text-white border-0 shadow-sm">
                            <ShieldCheck className="w-3 h-3 mr-1" />Verified Owner
                          </Badge>
                        )}
                        {listing.is_featured && (
                          <Badge className="bg-amber-400 text-amber-900 border-0">Featured</Badge>
                        )}
                        {topRanking && (
                          <Link href={`/best/${topRanking.metro_slug}`}>
                            <Badge className="bg-yellow-400 text-yellow-900 border-0 shadow-sm hover:bg-yellow-300 transition-colors">
                              <Trophy className="w-3 h-3 mr-1" />#{topRanking.rank} Best in {topRanking.metro_name}
                            </Badge>
                          </Link>
                        )}
                      </div>
                      <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-2">{listing.name}</h1>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-white/80 text-sm">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 shrink-0" />
                          {streetAddress(listing.address, listing.city, listing.state, listing.zip)}, {listing.city}, {listing.state}
                        </span>
                        {ratingStars}
                      </div>
                      <p className="mt-2.5 text-sm text-white/80 max-w-2xl leading-relaxed line-clamp-2">{heroDescription}</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* No-photo layout: clean gradient with content flowing naturally (no absolute overlay) */
            <HeroImageFallback variant="full" className="absolute inset-0" />
          )}

          {!heroImage && (
            <div className="relative">
              <div className="container mx-auto px-4 max-w-5xl py-8">
                <ListingBreadcrumb
                  listingName={listing.name}
                  stateSlug={params.state}
                  stateName={stateName}
                  citySlug={params.city}
                  cityName={cityName}
                  variant="hero"
                />

                <div className="flex items-start gap-4">
                  {logoImage && (
                    <LogoImage
                      src={logoImage}
                      alt={`${listing.name} logo`}
                      wrapperClassName="shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-white p-1.5 shadow-lg mt-1"
                      className="w-full h-full object-contain"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge className="bg-[#22C55E] text-white border-0 shadow-sm">
                        <CheckCircle className="w-3 h-3 mr-1" />Touchless Verified
                      </Badge>
                      {listing.touchless_satisfaction_score != null && (
                        <Badge className="border-0 shadow-sm text-white" style={{ backgroundColor: tssTier(listing.touchless_satisfaction_score).arc }}>
                          <Gauge className="w-3 h-3 mr-1" />Touchless Satisfaction {listing.touchless_satisfaction_score}
                        </Badge>
                      )}
                      {listing.paint_safe_verified && (
                        <Badge className="bg-emerald-600 text-white border-0 shadow-sm">
                          <ShieldCheck className="w-3 h-3 mr-1" />Paint-Safe Verified
                        </Badge>
                      )}
                      {listing.is_featured && (
                        <Badge className="bg-amber-400 text-amber-900 border-0">Featured</Badge>
                      )}
                      {topRanking && (
                        <Link href={`/best/${topRanking.metro_slug}`}>
                          <Badge className="bg-yellow-400 text-yellow-900 border-0 shadow-sm hover:bg-yellow-300 transition-colors">
                            <Trophy className="w-3 h-3 mr-1" />#{topRanking.rank} Best in {topRanking.metro_name}
                          </Badge>
                        </Link>
                      )}
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-2">{listing.name}</h1>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-white/80 text-sm">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 shrink-0" />
                        {streetAddress(listing.address, listing.city, listing.state, listing.zip)}, {listing.city}, {listing.state}
                      </span>
                      {ratingStars}
                    </div>
                    <p className="mt-2.5 text-sm text-white/80 max-w-2xl leading-relaxed line-clamp-2">{heroDescription}</p>
                    {topRanking && (
                      <Link
                        href={`/badge/${listing.slug}`}
                        className="inline-flex items-center gap-2 mt-4 bg-yellow-400 hover:bg-yellow-300 text-yellow-900 font-semibold text-sm px-4 py-2.5 rounded-lg shadow-lg hover:shadow-xl transition-all"
                      >
                        <Trophy className="w-4 h-4" />
                        Claim Your Badge
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="container mx-auto px-4 max-w-5xl py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Touchless Satisfaction Score — the headline 0–100 gauge. Shown
                  whenever the listing has enough touchless reviews to score. */}
              {listing.touchless_satisfaction_score != null && (
                <TouchlessSatisfactionGauge
                  score={listing.touchless_satisfaction_score}
                  pos={listing.touchless_pos ?? 0}
                  neg={listing.touchless_neg ?? 0}
                  mentions={listing.touchless_mentions ?? 0}
                  snippets={reviewSnippets
                    .filter((r) => r.touchless_about !== 'other_service' && r.review_text && r.review_text.length >= 30)
                    .map((r): TssSnippet => ({
                      id: r.id,
                      text: r.review_text,
                      sentiment: r.sentiment ?? null,
                      reviewerName: r.reviewer_name,
                      rating: r.rating,
                      date: r.review_date ?? null,
                    }))}
                />
              )}
              {cityScoreRanking.length >= 2 && (
                <TouchlessScoreComparison
                  items={cityScoreRanking}
                  currentId={listing.id}
                  cityLabel={listing.city}
                  cityHref={`/state/${getStateSlug(listing.state)}/${slugify(listing.city)}?sort=tss`}
                />
              )}
              {/* Paint-Safe module — verified badge + unified review-evidence drawer
                  (absorbs the old touchless-snippets section). Public badge only; the
                  granular paint_score stays internal for ranking. */}
              <PaintSafeModule
                state={(listing.paint_state as 'verified' | 'has_data_unverified' | 'not_enough') ?? 'not_enough'}
                reviewCount={listing.review_count ?? 0}
                paintPos={listing.paint_pos ?? 0}
                paintNeg={listing.paint_neg ?? 0}
                snippets={paintSnippets}
              />
              {/* AI-Generated Description */}
              {listing.description && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-3">{listing.name} — Touchless & Brushless Car Wash in {listing.city}, {listing.state}</h2>
                  <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {listing.description}
                  </div>
                </div>
              )}


              {/* Wash Type & Equipment */}
              {((listing.touchless_wash_types && listing.touchless_wash_types.length > 0) || listing.equipment_brand) && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-4 flex items-center gap-2">
                    <Droplet className="w-5 h-5 text-blue-500" />
                    Wash Type & Equipment
                  </h2>
                  {listing.touchless_wash_types && listing.touchless_wash_types.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {listing.touchless_wash_types.map((wt: string) => {
                        const info = WASH_TYPE_LABELS[wt] || { label: wt, color: 'bg-gray-100 text-gray-700 border-gray-200' };
                        return (
                          <Badge key={wt} className={`${info.color} border text-sm py-1 px-3`}>
                            {info.label}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  {listing.equipment_brand && (() => {
                    const brandLabel = getBrandLabel(listing.equipment_brand);
                    const displayText = listing.equipment_model
                      ? `${brandLabel} · ${listing.equipment_model}`
                      : brandLabel;
                    const brandData = getBrandBySlug(listing.equipment_brand);
                    // Link straight to the vendor page's model section (the old
                    // per-model URL now 301-redirects there, so we skip the hop).
                    const equipmentUrl = listing.equipment_model && brandData
                      ? `/equipment/${listing.equipment_brand}#model-${slugifyModel(listing.equipment_model)}`
                      : brandData ? `/equipment/${listing.equipment_brand}` : null;
                    return (
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">Equipment: </span>
                        {equipmentUrl ? (
                          <Link href={equipmentUrl} className="text-blue-600 hover:underline">
                            {displayText}
                          </Link>
                        ) : displayText}
                        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                          Equipment identified via AI image recognition and may not be 100% accurate. Car washes may upgrade or replace equipment over time.
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}

              {listing.amenities && listing.amenities.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#22C55E]" />
                    Amenities & Features
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {listing.amenities.map((a: string) => (
                      <Badge key={a} variant="outline" className="text-sm py-1 px-3 border-gray-200 text-gray-700">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {listing.wash_packages && listing.wash_packages.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-4">Wash Packages</h2>
                  <div className="space-y-3">
                    {listing.wash_packages.map((pkg, i) => (
                      <div key={i} className="flex items-start justify-between gap-4 p-3 rounded-lg bg-gray-50 border border-gray-100">
                        <div className="flex-1">
                          <div className="font-semibold text-[#0F2744]">{pkg.name}</div>
                          {pkg.description && <p className="text-sm text-gray-600 mt-0.5">{pkg.description}</p>}
                        </div>
                        {pkg.price && (
                          <span className="shrink-0 font-bold text-[#22C55E] text-lg">{pkg.price}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Membership Plans from extracted_data */}
              {Array.isArray(listing.extracted_data?.membership_plans) && listing.extracted_data!.membership_plans.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-[#22C55E]" />
                    Membership Plans
                  </h2>
                  <div className="space-y-3">
                    {listing.extracted_data!.membership_plans.map((plan, i) => {
                      const planFeatures = asArray(plan.features);
                      return (
                      <div key={i} className="p-3 rounded-lg bg-green-50 border border-green-100">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="font-semibold text-[#0F2744]">{plan.name}</div>
                            {planFeatures.length > 0 && (
                              <ul className="mt-1.5 space-y-0.5">
                                {planFeatures.map((f, j) => (
                                  <li key={j} className="text-sm text-gray-600 flex items-start gap-1.5">
                                    <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                                    {f}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          {plan.price && (
                            <span className="shrink-0 font-bold text-[#22C55E] text-lg">{plan.price}</span>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Subscription savings calculator — only where real monthly membership pricing exists */}
              {monthlyMemberships(listing).length > 0 && (
                <SavingsCalculator
                  listingName={listing.name}
                  memberships={monthlyMemberships(listing)}
                  defaultWashPrice={defaultWashPrice(listing)}
                />
              )}

              {/* Special Features & Payment Methods from extracted_data */}
              {listing.extracted_data && (asArray(listing.extracted_data.special_features).length > 0 || asArray(listing.extracted_data.payment_methods).length > 0) && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />
                    Additional Details
                  </h2>
                  {asArray(listing.extracted_data.special_features).length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-gray-600 mb-2">Special Features</h3>
                      <div className="flex flex-wrap gap-2">
                        {asArray(listing.extracted_data.special_features).map((f, i) => (
                          <Badge key={i} variant="outline" className="text-sm py-1 px-3 border-amber-200 bg-amber-50 text-amber-800">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {asArray(listing.extracted_data.payment_methods).length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-600 mb-2">Payment Methods</h3>
                      <div className="flex flex-wrap gap-2">
                        {asArray(listing.extracted_data.payment_methods).map((pm, i) => (
                          <Badge key={i} variant="outline" className="text-sm py-1 px-3 border-gray-200 text-gray-700">
                            {pm}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {galleryPhotos.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-4">Photos</h2>
                  <PhotoGalleryGrid photos={galleryPhotos} listingName={listing.name} />
                </div>
              )}

              {/* Touchless Sentiment — simple positive/negative/neutral badge (only show if there are actual reviews) */}
              {listing.touchless_sentiment && reviewSnippets.length > 0 && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${
                  listing.touchless_sentiment === 'positive'
                    ? 'bg-green-50 border-green-200'
                    : listing.touchless_sentiment === 'negative'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <span className="text-lg">
                    {listing.touchless_sentiment === 'positive' ? '👍' : listing.touchless_sentiment === 'negative' ? '👎' : '➖'}
                  </span>
                  <div>
                    <span className={`text-sm font-semibold ${
                      listing.touchless_sentiment === 'positive'
                        ? 'text-green-700'
                        : listing.touchless_sentiment === 'negative'
                        ? 'text-red-700'
                        : 'text-gray-600'
                    }`}>
                      {listing.touchless_sentiment === 'positive'
                        ? 'Positive touchless reviews'
                        : listing.touchless_sentiment === 'negative'
                        ? 'Negative touchless reviews'
                        : 'Mixed touchless reviews'}
                    </span>
                    <p className="text-xs text-gray-400">Based on customer review analysis</p>
                  </div>
                </div>
              )}

              {/* Touchless review snippets are now shown inside the Paint-Safe module
                  above (unified evidence drawer, "Touchless" theme chip). Section removed
                  here to avoid duplicating reviews on the page. */}

              {/* More Customer Reviews — positive, on-topic Google reviews that
                  aren't touchless-evidence. Adds review depth to drive engagement
                  without diluting the curated touchless-evidence section above. */}
              {genericReviews.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-bold text-[#0F2744] flex items-center gap-2">
                      <MessageSquareQuote className="w-5 h-5 text-[#0F2744]" />
                      More Customer Reviews
                    </h2>
                    <span className="text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full whitespace-nowrap">
                      {genericReviews.length} {genericReviews.length === 1 ? 'review' : 'reviews'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">
                    Recent customer reviews from Google for {listing.name}
                  </p>
                  <div className="space-y-3">
                    {genericReviews.map((snippet) => (
                      <ReviewSnippetCard key={snippet.id} snippet={snippet} />
                    ))}
                  </div>
                  {listing.google_place_id && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <a
                        href={`https://search.google.com/local/reviews?placeid=${listing.google_place_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#22C55E] hover:underline font-medium flex items-center gap-1.5"
                      >
                        Read all reviews on Google
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {equipmentVideos.length > 0 && (
                <TouchlessVideo listingId={listing.id} videos={equipmentVideos} preferBrand={listing.equipment_brand} />
              )}

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-[#0F2744] mb-5 flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-[#22C55E]" />
                  Frequently Asked Questions
                </h2>
                <div className="space-y-3">
                  {faqs.map((faq, i) => (
                    <details key={i} className="group border border-gray-200 rounded-xl overflow-hidden">
                      <summary className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer select-none bg-gray-50 hover:bg-gray-100 transition-colors">
                        <span className="text-sm font-semibold text-[#0F2744]">{faq.q}</span>
                        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 group-open:rotate-180 transition-transform" />
                      </summary>
                      <div className="px-4 py-3 text-sm text-gray-700 leading-relaxed border-t border-gray-100">
                        {faq.a}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-[#0F2744] uppercase tracking-wide mb-4">Contact & Info</h2>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <div className="text-sm text-gray-700">
                      {hasStreetAddress(listing.address, listing.city, listing.state, listing.zip) ? (
                        <>
                          <div>{streetAddress(listing.address, listing.city, listing.state, listing.zip)}</div>
                          <div>{listing.city}, {listing.state} {listing.zip}</div>
                        </>
                      ) : (
                        <>
                          <div>{listing.city}, {listing.state} {listing.zip}</div>
                          <div className="text-xs text-amber-600 mt-0.5">📍 Approximate location</div>
                        </>
                      )}
                    </div>
                  </div>
                  {listing.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                      <TrackableLink
                        href={`tel:${listing.phone}`}
                        listingId={listing.id}
                        eventType="phone"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {listing.phone}
                      </TrackableLink>
                    </div>
                  )}
                  {listing.website && (
                    <div className="flex items-center gap-3">
                      <Globe className="w-4 h-4 text-gray-400 shrink-0" />
                      <TrackableLink
                        href={listing.website}
                        listingId={listing.id}
                        eventType="website"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1 truncate"
                      >
                        <span className="truncate">Visit Website</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </TrackableLink>
                    </div>
                  )}
                </div>

                {(listing.address || (listing.latitude && listing.longitude)) && (
                  <div className="mt-4 flex flex-col gap-2">
                    <TrackableLink
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${streetAddress(listing.address, listing.city, listing.state, listing.zip)}, ${listing.city}, ${listing.state} ${listing.zip}`)}`}
                      listingId={listing.id}
                      eventType="directions"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-[#22C55E] text-white text-sm font-semibold py-3 rounded-xl hover:bg-[#16A34A] transition-colors shadow-sm"
                    >
                      <Navigation className="w-4 h-4" />
                      Get Directions
                    </TrackableLink>
                    <div className="flex gap-2">
                      {listing.google_place_id ? (
                        <a
                          href={`https://www.google.com/maps/place/?q=place_id:${listing.google_place_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 py-2 rounded-lg transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          View on Google
                        </a>
                      ) : (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${listing.name}, ${streetAddress(listing.address, listing.city, listing.state, listing.zip)}, ${listing.city}, ${listing.state} ${listing.zip}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 py-2 rounded-lg transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          View on Google
                        </a>
                      )}
                      <a
                        // streetViewUrl is resolved server-side: pinned to a
                        // Google-official pano_id when one exists at this
                        // address, otherwise the place page (with photos,
                        // reviews, and a Street View tab to browse manually).
                        // See lib/streetview-link.ts.
                        href={streetViewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 py-2 rounded-lg transition-colors"
                      >
                        <MapPin className="w-3 h-3" />
                        {streetViewUrl.includes('map_action=pano') ? 'Street View' : 'View on Map'}
                      </a>
                    </div>
                  </div>
                )}
                <SuggestEditModal listingId={listing.id} listingName={listing.name} />
              </div>

              <VerificationPrompt
                listingId={listing.id}
                listingName={listing.name}
                stats={verificationStats}
              />

              {listing.latitude && listing.longitude && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <ListingMap
                    lat={parseFloat(String(listing.latitude))}
                    lng={parseFloat(String(listing.longitude))}
                    name={listing.name}
                    address={`${streetAddress(listing.address, listing.city, listing.state, listing.zip)}, ${listing.city}, ${listing.state}`}
                  />
                </div>
              )}

              {hours && Object.keys(hours).length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h2 className="text-sm font-bold text-[#0F2744] uppercase tracking-wide mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Hours of Operation
                    <HoursStatusBadge hours={hours} />
                  </h2>
                  <div className="space-y-1.5">
                    {DAY_ORDER.filter((d) => hours[d]).map((day) => (
                      <div
                        key={day}
                        className={`flex justify-between text-sm py-1.5 px-2 rounded-lg ${day === todayKey ? 'bg-[#22C55E]/10 font-semibold text-[#0F2744]' : 'text-gray-600'}`}
                      >
                        <span className="capitalize">{DAY_LABELS[day]}</span>
                        <span>{hours[day]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button asChild variant="outline" className="w-full">
                <Link href={`/state/${params.state}/${params.city}`}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  More in {cityName}
                </Link>
              </Button>

              <ProductSidebar preset="listing" title="Touchless Gear" />
            </div>
          </div>

          {chainResult.listings.length > 0 && chainResult.chainName && (
            <div className="mt-10">
              <h2 className="text-xl font-bold text-[#0F2744] mb-5">
                More {chainResult.chainName} Locations
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {chainResult.listings.map((cl) => (
                  <NearbyListingCard key={cl.id} nearby={cl} stateSlug={getStateSlug(cl.state)} />
                ))}
              </div>
            </div>
          )}

          {/* Other Top-Ranked washes in the same metro — only renders for
              listings that themselves carry a Best-Of rank. Surfaces the
              full ranked alternatives inline so users don't have to bounce
              to /best/[metro] to discover them. Each card is its own
              click target (PV/session multiplier). */}
          {topRanking && metroSiblings.length > 0 && (
            <div className="mt-10 rounded-2xl border border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50 p-5 sm:p-6">
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 w-9 h-9 rounded-full bg-yellow-400 text-yellow-900 flex items-center justify-center shadow">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[#0F2744]">
                      More Top-Ranked Touchless Washes in {topRanking.metro_name}
                    </h2>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {listing.name} ranked #{topRanking.rank}. Here&rsquo;s the rest of the top {Math.min(10, metroSiblings.length + 1)}.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {metroSiblings.map(({ listing: sibling, rank }) => (
                  <div key={sibling.id} className="relative">
                    <NearbyListingCard nearby={sibling} stateSlug={getStateSlug(sibling.state)} />
                    <div className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-400 text-yellow-900 text-[11px] font-bold shadow">
                      <Trophy className="w-2.5 h-2.5" />#{rank}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-5 border-t border-yellow-200 flex items-center justify-between flex-wrap gap-3">
                <p className="text-sm text-gray-600">
                  Ranked by Google ratings, customer reviews, and touchless confirmation.
                </p>
                <Link
                  href={`/best/${topRanking.metro_slug}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2744] text-white text-sm font-semibold hover:bg-[#1a3a5e] transition-colors"
                >
                  View the Full Top 10 in {topRanking.metro_name.split(',')[0]}
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}

          {nearbyListings.length > 0 && (
            <div className="mt-10">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-[#0F2744]">
                  Other Touchless Car Washes Near {cityName}
                </h2>
                <Link
                  href={`/state/${params.state}/${params.city}`}
                  className="text-sm text-[#22C55E] hover:underline font-medium"
                >
                  View all in {cityName}
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {nearbyListings.map((nearby) => (
                  <NearbyListingCard key={nearby.id} nearby={nearby} stateSlug={params.state} />
                ))}
              </div>
              <div className="mt-6 pt-5 border-t border-gray-200 flex items-center justify-between flex-wrap gap-3">
                <p className="text-sm text-gray-500">
                  Explore all touchless and touch-free car washes in {stateName}
                </p>
                <Link
                  href={`/state/${params.state}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#0F2744] hover:text-[#22C55E] transition-colors"
                >
                  Browse more in {stateName}
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}

          {/* Affiliate Products — inline recommendations for car care */}
          <div className="mt-10">
            <ProductGrid preset="listing" variant="compact" bg="gray" />
          </div>

          <RelatedReading />

          {lastVerified && (
            <div className="mt-8 pt-6 border-t border-gray-200 flex items-center gap-2 text-xs text-gray-400">
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Last verified: {lastVerified}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
