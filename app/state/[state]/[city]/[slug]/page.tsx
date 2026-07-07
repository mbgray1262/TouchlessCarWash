/**
 * Listing detail page — the orchestrator. Route config, metadata, the
 * redirect ladder (missing / reverted / non-canonical URLs), one parallel
 * data fetch, and composition of the four layout sections. The moving parts
 * live in co-located modules:
 *   listing-data.ts      — every Supabase read
 *   listing-content.ts   — JSON-LD schema, FAQs, hours/label helpers
 *   listing-ui.tsx       — small shared cards (stars, snippets, nearby)
 *   ListingHero / ListingMainColumn / ListingSidebar / ListingCrossLinks
 */
import { permanentRedirect } from 'next/navigation';
import { supabase, type Listing } from '@/lib/supabase';
import { publicListingsCount } from '@/lib/public-listings';
import type { TssSnippet } from '@/components/TouchlessSatisfactionGauge';
import type { ScoreRankItem } from '@/components/TouchlessScoreComparison';
import { earnsTrophy } from '@/lib/metro-scoring';
import { US_STATES, getStateName, getStateSlug, slugify } from '@/lib/constants';
import { getAnyCityCoords, findNearestTouchlessCityPath } from '@/lib/geo-fallback';
import { streetAddress } from '@/lib/utils';
import { DEFAULT_OG_IMAGE, ensureHttps, truncateDescription } from '@/lib/seo';
import { getDisplayImage } from '@/lib/listing-image';
import { isThinListing } from '@/lib/listing-quality';
import { getOfficialStreetViewUrl, buildPlacePageUrl } from '@/lib/streetview-link';
import type { Metadata } from 'next';

import {
  getListing,
  buildListingUrl,
  findListingByPartialSlug,
  getNearbyListings,
  getChainListings,
  getVerificationStats,
  getReviewSnippets,
  isRealCustomerSnippet,
  getPaintModuleSnippets,
  getGenericReviews,
  getCityScoreRanking,
  getEquipmentVideos,
  getReviewSnippetCount,
  getBestOfRankings,
  getMetroSiblingRankings,
} from './listing-data';
import {
  getTodayKey,
  isImageUrl,
  buildLocalBusinessSchema,
  buildBreadcrumbSchema,
  buildFAQs,
  buildFAQSchema,
} from './listing-content';
import { ListingHero } from './ListingHero';
import { ListingMainColumn } from './ListingMainColumn';
import { ListingSidebar } from './ListingSidebar';
import { ListingCrossLinks } from './ListingCrossLinks';

// Force dynamic rendering — no ISR cache layer. Netlify CDN handles edge caching
// and purgeCache() reliably clears it when admins make edits.
// 1-hour ISR window, matching every other page. This is the site's
// highest-traffic page (~5k listing URLs = Google's landing pages); a short
// window meant it re-rendered via a serverless function up to 120x more often
// than the rest of the site, and Netlify's function-compute credit usage was
// doubling month-over-month (60→137→266 GB-Hrs) as SEO traffic grew. Admin
// edits do NOT wait on this window: every edit surface POSTs to /api/revalidate,
// which purges the Netlify CDN + pre-warms the page, so changes appear
// immediately. The window only governs re-rendering for anonymous traffic
// absent an edit — 1h keeps that compute bounded.
export const revalidate = 3600;
// ISR on-demand: prerender none at build, but mark the route static so each
// render is cached at the Netlify edge. A dynamic [param] route WITHOUT
// generateStaticParams is treated as fully dynamic (no-store) and bypasses the CDN.
export function generateStaticParams() { return []; }

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
  // Canonical URL is built from the listing's OWN state + city (via the same
  // buildListingUrl() the render path redirects to and that /sitemap.xml emits),
  // NOT from the request's params. A globally-unique slug resolves under any
  // /state/<state>/<city>/ prefix, so deriving the canonical from params would
  // let a wrong-state or apostrophe'd-city URL self-canonicalize to itself and
  // get flagged "Duplicate, Google chose different canonical than user".
  const canonicalUrl = `${SITE_URL}${buildListingUrl(listing)}`;
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
  // Trophy DISPLAY gate: only listings whose own Touchless Score is ≥ "Good"
  // wear the "#N Best …" endorsement. A ranked-but-below-Good wash keeps its
  // /best listing but falls back to the plain (non-trophy) title/description.
  const trophyRanking = topRanking && earnsTrophy(listing) ? topRanking : null;

  // Title CTR optimization:
  //   - Lead with ★ rating prefix when available (proven CTR booster in SERPs)
  //   - Drop "& Brushless" to make room — keyword is redundant with "Touchless"
  //   - Trophy-earning listings keep the "#N Best" authority signal
  const titleRatingPrefix = listing.rating > 0
    ? `★ ${Number(listing.rating).toFixed(1)} `
    : '';
  const title = trophyRanking
    ? `#${trophyRanking.rank} Best Touchless Car Wash in ${trophyRanking.metro_name} | ${listing.name}`
    : `${titleRatingPrefix}${listing.name} | Touchless Car Wash in ${listing.city}, ${listing.state}`;
  const ogTitle = trophyRanking
    ? `#${trophyRanking.rank} Best Touchless Car Wash in ${trophyRanking.metro_name} | ${listing.name}`
    : `${titleRatingPrefix}${listing.name} | Touchless Car Wash in ${listing.city}, ${stateName}`;

  // Lead with star rating for CTR — Google often shows this in snippet
  const ratingPrefix = listing.rating > 0
    ? `★ ${Number(listing.rating).toFixed(1)}${listing.review_count > 0 ? ` (${listing.review_count} reviews)` : ''} — `
    : '';
  const rankingPrefix = trophyRanking ? `#${trophyRanking.rank} Best Touchless & Brushless Car Wash in ${trophyRanking.metro_name}. ` : '';
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
    const { count: cityCount } = await publicListingsCount()
      .eq('state', listing.state)
      .eq('city', listing.city);
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
    const { count: stateCount } = await publicListingsCount().eq('state', listing.state);
    if ((stateCount ?? 0) > 0) {
      permanentRedirect(`/state/${stateSlug}${flag}`);
    }
    permanentRedirect(`/${flag}`);
  }

  // Canonical-path redirect: a listing's slug is globally unique, so this page
  // resolves no matter which /state/<state>/<city>/ prefix is used to reach it.
  // Only ONE prefix is canonical — the one built from the listing's true state
  // and canonical city slug, exactly matching what /sitemap.xml emits
  // (getStateSlug(state) + slugify(city); see app/sitemap.xml/route.ts). Any
  // other prefix 308-redirects here so Google never indexes a duplicate. This
  // catches two cases: a WRONG STATE (a cross-state-border "nearby" link that
  // filed a wash under the current page's state) and a non-canonical CITY-SLUG
  // spelling (e.g. /coeur-d'alene/ vs /coeur-dalene/). Fixes recurring GSC
  // "Duplicate, Google chose different canonical than user" warnings.
  const canonicalPath = buildListingUrl(listing);
  if (canonicalPath !== `/state/${params.state}/${params.city}/${params.slug}`) {
    permanentRedirect(canonicalPath);
  }

  const [nearbyListings, reviewSnippets, genericReviews, rankings, chainResult, verificationStats, equipmentVideos, paintSnippets, cityScoreRanking, badgeEmbedRes] = await Promise.all([
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
    // Has the owner put the badge to use? (claimed the listing OR embedded the
    // badge on their site — the latter is how Tom's/Black Dog show up). When in
    // use, the "Claim your badge" CTAs become a "Badge active" acknowledgment.
    supabase.from('badge_embeds').select('id').eq('listing_slug', listing.slug).limit(1),
  ]);
  const badgeInUse = listing.is_claimed === true || ((badgeEmbedRes?.data?.length ?? 0) > 0);

  // De-dup touchless reviews: the Touchless Satisfaction gauge owns the
  // "what customers say about the touchless wash" evidence. When the gauge is
  // shown (listing has a score), the Paint-Safe module must NOT also render
  // touchless snippets — so feed it paint-only snippets (its hide-empty logic
  // then suppresses the touchless section + chip). Only when there's no gauge
  // does the Paint-Safe module surface touchless evidence as the fallback home.
  const touchlessReviewSnippets = reviewSnippets
    .filter((r) => r.touchless_about !== 'other_service' && r.review_text && r.review_text.length >= 30 && isRealCustomerSnippet(r))
    .map((r): TssSnippet => ({
      id: r.id,
      text: r.review_text,
      sentiment: r.sentiment ?? null,
      reviewerName: r.reviewer_name,
      rating: r.rating,
      date: r.review_date ?? null,
    }));
  // Show the touchless-reviews module whenever there's a score OR at least one
  // labeled touchless review. The review snippets ALWAYS show; only the 0–100
  // score gauge waits for the 3-mention confidence gate.
  const hasTouchlessReviews = touchlessReviewSnippets.some((s) => s.sentiment === 'positive' || s.sentiment === 'negative');
  const showTouchlessGauge = listing.touchless_satisfaction_score != null || hasTouchlessReviews;
  // When the touchless module is shown it owns the touchless evidence, so the
  // Paint-Safe module renders paint-only (no double-showing of touchless reviews).
  const paintModuleSnippets = showTouchlessGauge
    ? paintSnippets.filter((s) => s.theme === 'paint')
    : paintSnippets;

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
  // Photos an admin removed in the photo-audit tool (blocked_photos) must not
  // resurface via the google_photo_url / street_view_url auto-appends. The
  // current hero is exempt: if it was later re-chosen it wins over an old block.
  const blockedPhotos = new Set(
    (listing.blocked_photos ?? []).filter((u) => u !== heroImage),
  );
  for (const p of candidatePhotos) {
    if (p && isImageUrl(p) && p !== logoImage && !seenUrls.has(p) && !blockedPhotos.has(p)) {
      seenUrls.add(p);
      allGalleryPhotos.push(p);
    }
  }

  const galleryPhotos = allGalleryPhotos.slice(0, 8);
  const hours = listing.hours as Record<string, string> | null;
  // Open/closed status is now handled client-side by HoursStatusBadge
  // to use the user's local timezone instead of the server's UTC time

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
      name: listing.name,
      address: listing.address,
      city: listing.city,
      state: listing.state,
      zip: listing.zip,
    });

  // "View on Google" deep-link — pinned to the exact place_id so a co-located
  // business at the same address (e.g. a Grease Monkey sharing the lot) can't
  // hijack the panel/photos. Falls back to a name+address search otherwise.
  const viewOnGoogleUrl = buildPlacePageUrl({
    placeId: listing.google_place_id,
    name: listing.name,
    address: listing.address,
    city: listing.city,
    state: listing.state,
    zip: listing.zip,
  });

  const topRanking = rankings.length > 0 ? rankings[0] : null;
  // Trophy DISPLAY gate (see lib/metro-scoring earnsTrophy): the #N trophy chip
  // and "Claim Your Badge" CTA only show when this wash's own Touchless Score is
  // ≥ "Good". Below that it keeps its /best listing but wears no trophy.
  const trophyRanking = topRanking && earnsTrophy(listing) ? topRanking : null;
  // Award year derived from the ranking's computed_at (matches the badge page).
  const awardYear = trophyRanking?.computed_at
    ? new Date(trophyRanking.computed_at).getFullYear()
    : new Date().getFullYear();

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
        <ListingHero
          listing={listing}
          stateSlug={params.state}
          citySlug={params.city}
          stateName={stateName}
          cityName={cityName}
          trophyRanking={trophyRanking}
          badgeInUse={badgeInUse}
          heroImage={heroImage}
          logoImage={logoImage}
          heroObjectPosition={heroObjectPosition}
        />

        <div className="container mx-auto px-4 max-w-5xl py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <ListingMainColumn
              listing={listing}
              showTouchlessGauge={showTouchlessGauge}
              touchlessReviewSnippets={touchlessReviewSnippets}
              cityScoreRanking={cityScoreRanking}
              paintModuleSnippets={paintModuleSnippets}
              genericReviews={genericReviews}
              galleryPhotos={galleryPhotos}
              equipmentVideos={equipmentVideos}
              faqs={faqs}
            />

            <ListingSidebar
              listing={listing}
              stateSlug={params.state}
              citySlug={params.city}
              cityName={cityName}
              hours={hours}
              todayKey={todayKey}
              trophyRanking={trophyRanking}
              badgeInUse={badgeInUse}
              awardYear={awardYear}
              verificationStats={verificationStats}
              streetViewUrl={streetViewUrl}
              viewOnGoogleUrl={viewOnGoogleUrl}
            />
          </div>

          <ListingCrossLinks
            listing={listing}
            stateSlug={params.state}
            citySlug={params.city}
            stateName={stateName}
            cityName={cityName}
            chainResult={chainResult}
            trophyRanking={trophyRanking}
            metroSiblings={metroSiblings}
            nearbyListings={nearbyListings}
            lastVerified={lastVerified}
          />
        </div>
      </div>
    </>
  );
}
