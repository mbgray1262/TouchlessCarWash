import { cache, Suspense } from 'react';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase, LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { US_STATES, getStateName, slugify, getStateSlug } from '@/lib/constants';
import { CityListingsClient } from '@/components/CityListingsClient';
import { ListingCard } from '@/components/ListingCard';
import { RedirectBanner } from '@/components/RedirectBanner';
import { RelatedReading } from '@/components/RelatedReading';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';
import { getAnyCityCoords, findNearestTouchlessCityPath } from '@/lib/geo-fallback';
import {
  getStateListingsForAugment,
  getListingCardsByIds,
  pickAnchorFromListings,
  selectNearby,
  NEARBY_RADIUS_MILES,
  INDEXABLE_MIN_EFFECTIVE,
} from '@/lib/nearby-augment';
import { FEATURE_FILTERS, MIN_LISTINGS_FOR_FEATURE_PAGE } from '@/lib/feature-filters';
import { findMetroForCity } from '@/lib/metro-areas';
import { Trophy } from 'lucide-react';

import type { Metadata } from 'next';

// ISR — regenerate every hour. Now actually works because we removed searchParams!
export const dynamic = 'force-dynamic'; // see /state/.../slug for context — Netlify CDN cache (netlify.toml) handles edge perf; force-dynamic prevents the Next.js ISR etag-based 304-without-body bug that kept breaking /blog and /best on the CDN.

interface Filter {
  id: number;
  name: string;
  slug: string;
  category: string;
  icon: string | null;
}

interface CityPageProps {
  params: {
    state: string;
    city: string;
  };
}

function getStateCode(stateSlug: string): string | null {
  const state = US_STATES.find((s) => slugify(s.name) === stateSlug);
  return state ? state.code : null;
}

/**
 * Resolve a URL slug back to the actual city name stored in the database.
 * The slugify() function is lossy (e.g. "St. Petersburg" → "st-petersburg",
 * "Winston-Salem" → "winston-salem") so we can't reverse it by just capitalizing.
 * Instead, we query distinct city names for the state and find the one whose
 * slugified form matches the URL slug.
 */
const resolveCityName = cache(async (stateCode: string, citySlug: string): Promise<string | null> => {
  // Intentionally does NOT filter on is_touchless: we need to resolve the
  // city name even for cities whose only listings have been reverted. The
  // downstream getCityListings() applies the touchless filter, and if that
  // returns empty the page handler performs a soft-404 redirect to the
  // nearest live city rather than a hard 404.
  //
  // The previous approach of selecting all city rows in a state and
  // scanning them client-side hit Supabase's default 1000-row cap in
  // large states like TX (3,800+ listings), causing valid-but-rare city
  // slugs to falsely resolve to null. Instead we candidate-match via
  // case-insensitive ilike on the first token of the slug, then slug-
  // compare each candidate server-side. Small, fast, state-scoped.
  const firstToken = citySlug.split('-')[0];
  const { data } = await supabase
    .from('listings')
    .select('city')
    .eq('state', stateCode)
    .ilike('city', `${firstToken}%`)
    .limit(1000);
  if (!data) return null;

  const seen = new Set<string>();
  for (const row of data) {
    if (seen.has(row.city)) continue;
    seen.add(row.city);
    if (slugify(row.city) === citySlug) return row.city;
  }
  return null;
});

// Cached so generateMetadata and component share the same result per request.
// We fetch latitude/longitude alongside the card columns so we can pick a
// geographic anchor for the "in or near" augmentation without a second query.
const getCityListings = cache(async (stateCode: string, cityName: string): Promise<Listing[]> => {
  const { data, error } = await supabase
    .from('listings')
    .select(`${LISTING_CARD_COLUMNS}, latitude, longitude`)
    .eq('is_touchless', true)
    .eq('state', stateCode)
    .ilike('city', cityName)
    .order('rating', { ascending: false });

  if (error || !data) return [];
  return data as Listing[];
});

/**
 * Resolve "nearby" augmentation for a city: find approved touchless listings
 * within NEARBY_RADIUS_MILES of the city's anchor, excluding listings already
 * shown for the city. Returns [] when the city has no listings with coords.
 * Cached per (state, city) so generateMetadata and the page share results.
 */
const getNearbyForCity = cache(
  async (
    stateCode: string,
    cityName: string,
    inCity: Listing[],
  ): Promise<Array<Listing & { _distance: number }>> => {
    const anchor = pickAnchorFromListings(inCity);
    if (!anchor) return [];
    // Stage 1: slim proximity scan (id/city/lat/lng only — fast even for TX ~3000 rows)
    const slimListings = await getStateListingsForAugment(stateCode);
    const exclude = new Set(inCity.map((l) => l.id));
    const proximityResults = selectNearby(slimListings, anchor, cityName, exclude);
    if (proximityResults.length === 0) return [];
    // Stage 2: fetch full card data for only the selected ~8 nearby listings
    const nearbyIds = proximityResults.map((p) => p.id);
    const fullListings = await getListingCardsByIds(nearbyIds);
    const distanceMap = new Map(proximityResults.map((p) => [p.id, p._distance]));
    return fullListings
      .map((l) => ({ ...l, _distance: distanceMap.get(l.id) ?? 0 }))
      .sort((a, b) => a._distance - b._distance);
  },
);

// Returns the STATIC TEMPLATE with placeholders like {{TOTAL_LISTINGS}},
// {{TOP_LISTING}}, {{TOP_RATING}}, {{TOP_REVIEWS}}. The placeholders get
// substituted at render time via renderCityDescription so counts never
// go stale as listings are added/removed/reverted.
const getCityDescriptionTemplate = cache(async (stateCode: string, cityName: string): Promise<string | null> => {
  const { data } = await supabase
    .from('city_descriptions')
    .select('description')
    .eq('state', stateCode)
    .ilike('city', cityName)
    .maybeSingle();
  return data?.description ?? null;
});

interface CityDescriptionStats {
  total: number;
  topListing?: { name: string; rating: number | null; review_count: number | null };
}

/**
 * Substitute placeholder tokens in a city description template with live
 * values from current DB reads. Keeps counts and top-listing callouts
 * always accurate.
 */
function renderCityDescription(template: string | null, stats: CityDescriptionStats): string | null {
  if (!template) return null;
  const topName = stats.topListing?.name ?? '';
  const topRating = stats.topListing?.rating != null ? Number(stats.topListing.rating).toFixed(1) : '';
  const topReviews = stats.topListing?.review_count != null ? String(stats.topListing.review_count) : '';
  return template
    .replace(/\{\{TOTAL_LISTINGS\}\}/g, String(stats.total))
    .replace(/\{\{TOP_LISTING\}\}/g, topName)
    .replace(/\{\{TOP_RATING\}\}/g, topRating)
    .replace(/\{\{TOP_REVIEWS\}\}/g, topReviews);
}

const getFilters = cache(async (): Promise<Filter[]> => {
  const { data } = await supabase
    .from('filters')
    .select('id, name, slug, category, icon')
    .order('sort_order');
  return (data as Filter[]) ?? [];
});

async function getCitiesInState(stateCode: string, excludeCitySlug: string): Promise<{ city: string; count: number; slug: string }[]> {
  const { data, error } = await supabase.rpc('cities_in_state_with_counts', { p_state: stateCode });
  if (error || !data) return [];

  return (data as { city: string; count: number }[])
    .map(({ city, count }) => ({
      city,
      count,
      slug: slugify(city),
    }))
    .filter(c => c.slug !== excludeCitySlug);
}

/** Build filter→listingIds map for in-memory client-side filtering */
async function getFilterMapForListings(listingIds: string[]): Promise<Record<number, string[]>> {
  if (listingIds.length === 0) return {};
  const CHUNK = 500;
  const allRows: { filter_id: number; listing_id: string }[] = [];
  for (let i = 0; i < listingIds.length; i += CHUNK) {
    const chunk = listingIds.slice(i, i + CHUNK);
    const { data } = await supabase
      .from('listing_filters')
      .select('filter_id, listing_id')
      .in('listing_id', chunk);
    if (data) allRows.push(...(data as { filter_id: number; listing_id: string }[]));
  }
  const map: Record<number, string[]> = {};
  for (const row of allRows) {
    if (!map[row.filter_id]) map[row.filter_id] = [];
    map[row.filter_id].push(row.listing_id);
  }
  return map;
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const stateCode = getStateCode(params.state);
  if (!stateCode) return { title: 'Not Found' };
  const cityName = await resolveCityName(stateCode, params.city);
  if (!cityName) return { title: 'Not Found' };
  const stateName = getStateName(stateCode);

  const [listings, descTemplate] = await Promise.all([
    getCityListings(stateCode, cityName),
    getCityDescriptionTemplate(stateCode, cityName),
  ]);
  const nearby = await getNearbyForCity(stateCode, cityName, listings);

  const ratedListings = listings.filter(l => l.rating != null && l.rating > 0);
  const avgRating = ratedListings.length > 0
    ? (ratedListings.reduce((sum, l) => sum + l.rating, 0) / ratedListings.length).toFixed(1)
    : null;
  const totalReviews = listings.reduce((sum, l) => sum + (l.review_count ?? 0), 0);

  // Compute top listing for placeholder substitution (same ranking as script)
  const topListing = [...ratedListings].sort(
    (a, b) => (b.rating * Math.log10((b.review_count ?? 0) + 2)) - (a.rating * Math.log10((a.review_count ?? 0) + 2))
  )[0];
  const cityDesc = renderCityDescription(descTemplate, {
    total: listings.length,
    topListing: topListing ? { name: topListing.name, rating: topListing.rating, review_count: topListing.review_count } : undefined,
  });

  const ratingSnippet = avgRating && totalReviews > 0
    ? ` Avg ${avgRating}★ across ${totalReviews.toLocaleString()} reviews.`
    : '';

  const effectiveCount = listings.length + nearby.length;
  const metaDescription = cityDesc
    ? cityDesc.substring(0, 155) + (cityDesc.length > 155 ? '...' : '')
    : `Find ${effectiveCount} touchless, brushless, contactless & no-touch car washes in or near ${cityName}, ${stateName}.${ratingSnippet} Verified locations with ratings, hours, and directions.`;

  const now = new Date();
  const month = now.toLocaleString('default', { month: 'long' });
  const year = now.getFullYear();
  // Use slugify(cityName) so the canonical URL never contains an apostrophe
  // even when params.city does (e.g. /coeur-d'alene → /coeur-dalene). Stops
  // GSC "Duplicate, Google chose different canonical than user" warnings.
  const canonicalUrl = `https://touchlesscarwashfinder.com/state/${params.state}/${slugify(cityName) || params.city}`;
  const monthShort = now.toLocaleString('default', { month: 'short' });
  // Title kept under ~60 chars to avoid Google's SERP truncation, which was
  // hiding the location count + freshness signals on the previous template
  // ("Best Touchless Car Wash in San Diego, CA — 47 Verified Locations (May 2026)" = 76 chars).
  // Adds "Near Me" modifier — top search modifier per GSC (21K imp/mo on "touchless car wash near me").
  const title = `Touchless Car Wash Near Me in ${cityName}, ${stateCode} — ${effectiveCount} Locations`;

  // Noindex when:
  //   1. There are NO in-city approved touchless listings (page is just a
  //      shell pointing to nearby cities — Google flags this as a duplicate
  //      of the nearby city pages that already list those same listings), OR
  //   2. The augmented (in-city + nearby) count is too thin to rank or be
  //      useful at all.
  // Keep canonical so Google knows the URL is intentional.
  const thinPage = listings.length === 0 || effectiveCount < INDEXABLE_MIN_EFFECTIVE;

  return {
    title,
    description: metaDescription,
    ...(thinPage ? { robots: { index: false, follow: true } } : {}),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description: metaDescription,
      url: canonicalUrl,
      siteName: 'Touchless Car Wash Finder',
      type: 'website',
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function CityPage({ params }: CityPageProps) {
  const stateCode = getStateCode(params.state);
  if (!stateCode) notFound();

  // URL canonicalization (BEFORE resolveCityName): if the requested city
  // slug contains characters that slugify() would normalize away (literal
  // apostrophes, uppercase, spaces, etc.), 308 to the canonical slug.
  // Without this, resolveCityName won't match the apostrophe form because
  // slugify(db_city) produces "coeur-d-alene" while params.city would be
  // "coeur-d'alene", and we'd 404→/state redirect instead of preserving
  // the page. Fixes GSC "Duplicate, Google chose different canonical"
  // warnings on apostrophe cities.
  const normalizedCitySlug = slugify(params.city);
  if (normalizedCitySlug && normalizedCitySlug !== params.city) {
    permanentRedirect(`/state/${params.state}/${normalizedCitySlug}`);
  }

  const stateName = getStateName(stateCode!);
  const cityName = await resolveCityName(stateCode!, params.city);
  // City has zero listings in the DB (fully deleted, not just de-approved).
  // Redirect to the state hub instead of hard 404 — preserves link equity
  // and resolves the cascade where listing-page redirects land on a dead city.
  if (!cityName) permanentRedirect(`/state/${params.state}`);

  // Fetch all base data in a single parallel stage — no waterfalls
  const [allListings, nearbyCities, descTemplate, allFilters] = await Promise.all([
    getCityListings(stateCode!, cityName),
    getCitiesInState(stateCode!, params.city),
    getCityDescriptionTemplate(stateCode!, cityName),
    getFilters(),
  ]);

  // "In or near" augmentation — pulls touchless listings from cities within
  // NEARBY_RADIUS_MILES so single-listing cities still feel useful and clear
  // Google's thin-content bar. cache() ensures we don't re-query for metadata.
  const nearbyListings = await getNearbyForCity(stateCode!, cityName, allListings);

  // City has no approved touchless listings — happens when every listing
  // in the city was reverted (not actually touchless) or deleted (business
  // closed / not a car wash). 301-redirect to the geographically nearest
  // city that does have approved listings, preferring same state. Better
  // UX than state-level fallback: a user searching for Rocky Mount, VA
  // lands on the closest touchless option, not an abstract state page.
  if (allListings.length === 0) {
    const flag = `?from=empty-city&orig=${encodeURIComponent(params.city)}`;
    const coords = await getAnyCityCoords(stateCode!, params.city);
    if (coords) {
      const nearest = await findNearestTouchlessCityPath(coords, stateCode);
      if (nearest) permanentRedirect(`${nearest}${flag}`);
    }
    const { count: stateCount } = await supabase
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('state', stateCode!)
      .eq('is_touchless', true)
      .eq('is_approved', true);
    if ((stateCount ?? 0) > 0) {
      permanentRedirect(`/state/${params.state}${flag}`);
    }
    permanentRedirect(`/${flag}`);
  }

  // Substitute template placeholders with live counts + top-listing data
  const ratedForTop = allListings.filter(l => l.rating != null && l.rating > 0);
  const topListingForDesc = [...ratedForTop].sort(
    (a, b) => (b.rating * Math.log10((b.review_count ?? 0) + 2)) - (a.rating * Math.log10((a.review_count ?? 0) + 2))
  )[0];
  const cityDescription = renderCityDescription(descTemplate, {
    total: allListings.length,
    topListing: topListingForDesc
      ? { name: topListingForDesc.name, rating: topListingForDesc.rating, review_count: topListingForDesc.review_count }
      : undefined,
  });

  // Previously redirected cities with fewer than 3 listings — removed.
  // Even a single listing is useful to searchers and can rank for city-specific queries.

  // Build filter→listingIds map for client-side in-memory filtering
  const filterMap = await getFilterMapForListings(allListings.map(l => l.id));

  // FAQ data always uses the full unfiltered listings
  const listingsWithRating = allListings.filter(l => l.rating != null && l.rating > 0);
  const topRatingValue = listingsWithRating.length > 0 ? Math.max(...listingsWithRating.map(l => l.rating)) : null;
  const topRatedListings = topRatingValue != null
    ? listingsWithRating.filter(l => l.rating === topRatingValue)
    : [];

  const listingsWithReviews = allListings.filter(l => l.review_count != null && l.review_count > 0);
  const topReviewCount = listingsWithReviews.length > 0 ? Math.max(...listingsWithReviews.map(l => l.review_count)) : null;
  const mostReviewedListings = topReviewCount != null
    ? listingsWithReviews.filter(l => l.review_count === topReviewCount)
    : [];

  const topRated = listingsWithRating.length > 0 ? listingsWithRating[0] : allListings[0];

  function buildHighestRatedAnswer(): string {
    if (allListings.length === 1) {
      const l = allListings[0];
      if (l.rating != null && l.rating > 0) {
        return `${l.name} is the touchless car wash in ${cityName} with a ${l.rating}-star rating.`;
      }
      return `${l.name} is the touchless car wash in ${cityName}.`;
    }
    if (topRatedListings.length === 0) {
      return `None of the ${allListings.length} touchless car washes in ${cityName} currently have ratings. Check each listing for the most up-to-date information.`;
    }
    if (topRatedListings.length === 1) {
      return `${topRatedListings[0].name} is the top-rated touchless car wash in ${cityName} with a ${topRatingValue}-star rating.`;
    }
    const names = topRatedListings.map(l => l.name);
    const last = names.pop();
    return `${names.join(', ')} and ${last} are tied as the top-rated touchless car washes in ${cityName}, each with a ${topRatingValue}-star rating.`;
  }

  function buildMostReviewedAnswer(): string {
    if (allListings.length === 1) {
      const l = allListings[0];
      if (l.review_count != null && l.review_count > 0) {
        return `${l.name} is the only touchless car wash in ${cityName} and has ${l.review_count} review${l.review_count !== 1 ? 's' : ''}.`;
      }
      return `${l.name} is the only touchless car wash listed in ${cityName}. It does not yet have any reviews.`;
    }
    if (mostReviewedListings.length === 0) {
      return `None of the ${allListings.length} touchless car washes in ${cityName} currently have reviews. Check each listing for the most up-to-date information.`;
    }
    if (mostReviewedListings.length === 1) {
      return `${mostReviewedListings[0].name} has the most reviews of any touchless car wash in ${cityName} with ${topReviewCount} review${topReviewCount !== 1 ? 's' : ''}.`;
    }
    const names = mostReviewedListings.map(l => l.name);
    const last = names.pop();
    return `${names.join(', ')} and ${last} are tied for the most-reviewed touchless car washes in ${cityName}, each with ${topReviewCount} review${topReviewCount !== 1 ? 's' : ''}.`;
  }

  const highestRatedAnswer = buildHighestRatedAnswer();
  const mostReviewedAnswer = buildMostReviewedAnswer();

  const cityVariant = params.city.charCodeAt(0) % 4;
  const introSynonyms = [
    `touchless, touch-free, and no-touch`,
    `touchless, laser car wash, and contactless`,
    `touchless, scratch-free, and touch-free`,
    `touchless, no-touch, and laser car wash`,
  ][cityVariant];

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://touchlesscarwashfinder.com' },
      { '@type': 'ListItem', position: 2, name: 'States', item: 'https://touchlesscarwashfinder.com/states' },
      { '@type': 'ListItem', position: 3, name: stateName, item: `https://touchlesscarwashfinder.com/state/${params.state}` },
      { '@type': 'ListItem', position: 4, name: cityName, item: `https://touchlesscarwashfinder.com/state/${params.state}/${params.city}` },
    ],
  };

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Touchless Car Washes in ${cityName}, ${stateCode}`,
    numberOfItems: allListings.length,
    itemListElement: allListings.map((listing, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'AutoWash',
        name: listing.name,
        description: `Touchless, touch-free car wash in ${cityName}, ${stateCode}`,
        url: `https://touchlesscarwashfinder.com/state/${params.state}/${params.city}/${listing.slug}`,
        telephone: listing.phone ?? undefined,
        address: {
          '@type': 'PostalAddress',
          streetAddress: listing.address ?? undefined,
          addressLocality: listing.city,
          addressRegion: listing.state,
          postalCode: listing.zip ?? undefined,
          addressCountry: 'US',
        },
        ...(listing.rating != null && listing.rating > 0 && listing.review_count != null && listing.review_count > 0
          ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: listing.rating, reviewCount: listing.review_count, bestRating: 5 } }
          : {}),
      },
    })),
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `How many touchless car washes are in ${cityName}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `There are ${allListings.length} verified touchless car wash${allListings.length !== 1 ? 'es' : ''} in ${cityName}, ${stateName}.`,
        },
      },
      {
        '@type': 'Question',
        name: allListings.length === 1
          ? `What is the touchless car wash in ${cityName}?`
          : `What is the highest rated touchless car wash in ${cityName}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: highestRatedAnswer,
        },
      },
      {
        '@type': 'Question',
        name: allListings.length === 1
          ? `How many reviews does the touchless car wash in ${cityName} have?`
          : `Which touchless car wash in ${cityName} has the most reviews?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: mostReviewedAnswer,
        },
      },
      {
        '@type': 'Question',
        name: 'Are touchless car washes safe for my car?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Touchless car washes use high-pressure water jets and specialized detergents instead of physical brushes or cloth. This eliminates the risk of swirl marks, micro-scratches, and paint damage that can occur with traditional brush-based washes, making them the safest automated wash option for all paint types, clear coats, ceramic coatings, and PPF. Owners of Tesla, BMW, Mercedes-Benz, Lexus, Audi, and other luxury vehicles choose touchless washes to protect their finish.',
        },
      },
      {
        '@type': 'Question',
        name: "What's the difference between touchless and brushless car washes?",
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The terms are often used interchangeably. Both refer to car wash systems that clean your vehicle without any physical contact. Touchless washes rely entirely on high-pressure water and chemical cleaners. Brushless washes may use soft foam or cloth materials that are gentler than traditional nylon brushes but still make light contact. All listings on this directory use non-contact or near-contact methods safe for vehicle paint.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is a laser car wash the same as a touchless car wash?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Laser car washes — also called touch-free or no-touch car washes — use high-pressure water jets and detergents instead of brushes or cloth. The term "laser" refers to the sensor technology used to detect your vehicle\'s shape and size, not actual lasers doing the cleaning. The result is the same contactless, scratch-free wash as any other touchless system.',
        },
      },
      {
        '@type': 'Question',
        name: 'Are touchless car washes scratch-free?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Because touchless (also called brushless or contactless) car washes never physically touch your vehicle, they eliminate the risk of scratches and swirl marks that brush-based washes can leave behind. High-pressure water and specially formulated detergents do all the cleaning, making them the safest automated option for any paint type or finish — from everyday vehicles to luxury brands like Tesla, BMW, Mercedes-Benz, Lexus, and Porsche.',
        },
      },
      {
        '@type': 'Question',
        name: 'Are touchless car washes safe for Tesla, BMW, and other luxury vehicles?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Touchless car washes are the safest automated wash option for luxury and high-end vehicles including Tesla, BMW, Mercedes-Benz, Lexus, Audi, and Porsche. Because no brushes or cloth touch your vehicle, there\'s zero risk of scratching delicate paint, clear coats, ceramic coatings, or paint protection film (PPF). If you\'ve invested in protecting your vehicle\'s finish, a touchless or touch-free car wash is the recommended choice.',
        },
      },
    ],
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <RedirectBanner />

      <div className="bg-[#0F2744] py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-4">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/states" className="hover:text-white transition-colors">States</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href={`/state/${params.state}`} className="hover:text-white transition-colors">{stateName}</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">{cityName}</span>
          </nav>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Touchless & Brushless Car Washes In or Near {cityName}, {stateCode}
          </h1>
          <p className="text-white/80 text-lg">
            {allListings.length} verified touchless car wash{allListings.length !== 1 ? 'es' : ''} in {cityName}
            {nearbyListings.length > 0 && (
              <> + {nearbyListings.length} more within {NEARBY_RADIUS_MILES} miles</>
            )}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-10">

        <div className="mb-8 p-5 bg-blue-50 border border-blue-100 rounded-xl">
          <p className="text-gray-700 text-base leading-relaxed">
            {cityDescription ? cityDescription : (
              <>
                Find the best {introSynonyms} car washes in or near {cityName}, {stateName}. We&apos;ve verified{' '}
                <strong>{allListings.length} location{allListings.length !== 1 ? 's' : ''}</strong> in {cityName}
                {nearbyListings.length > 0 && (
                  <> plus <strong>{nearbyListings.length} nearby option{nearbyListings.length !== 1 ? 's' : ''} within {NEARBY_RADIUS_MILES} miles</strong></>
                )}{' '}
                that offer brushless, contactless washing to keep your car&apos;s paint and finish scratch-free.
                {topRated.rating && (
                  <> Top-rated option: <strong>{topRated.name}</strong> ({topRated.rating} stars).</>
                )}
              </>
            )}
          </p>
        </div>

        {/* Find the metro this city belongs to (if any) and compute Best-Of
            cross-linking signals: the CTA banner above the listings + rank
            badges on the top 3 cards. Uses the same score formula as
            /best/[metro] so the rankings agree. */}
        {(() => {
          // Use a representative lat/lng from the first listing with coords
          const sample = allListings.find((l) => l.latitude != null && l.longitude != null);
          const metro = findMetroForCity(
            params.city,
            stateCode!,
            sample?.latitude ?? undefined,
            sample?.longitude ?? undefined,
          );

          // Compute rank by score = rating × log10(reviews + 2). Only listings
          // with rating > 0 are eligible (matches /best/[metro] behavior).
          const ratedListings = allListings.filter((l) => (l.rating ?? 0) > 0);
          const sortedByScore = [...ratedListings].sort(
            (a, b) =>
              (b.rating ?? 0) * Math.log10((b.review_count ?? 0) + 2) -
              (a.rating ?? 0) * Math.log10((a.review_count ?? 0) + 2),
          );
          const rankMap: Record<string, number> = {};
          sortedByScore.slice(0, 3).forEach((l, i) => {
            rankMap[l.id] = i + 1;
          });

          return (
            <>
              {metro && allListings.length >= 5 && (
                <div className="mb-8 rounded-2xl border border-yellow-200 bg-gradient-to-r from-yellow-50 to-amber-50 p-5 sm:p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-10 h-10 rounded-full bg-yellow-400 text-yellow-900 flex items-center justify-center shadow">
                        <Trophy className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-[#0F2744]">
                          See the Best Touchless Car Washes in {metro.displayName}
                        </h2>
                        <p className="text-sm text-gray-700 mt-0.5">
                          Our ranked guide to the top {Math.min(10, sortedByScore.length)} verified touchless washes — by rating, review volume, and touchless confirmation.
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/best/${metro.slug}`}
                      className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#0F2744] text-white text-sm font-semibold hover:bg-[#1a3a5e] transition-colors whitespace-nowrap"
                    >
                      View Best Of {metro.displayName.split(',')[0]}
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              )}

              <Suspense fallback={
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: Math.min(allListings.length, 12) }).map((_, i) => (
                    <div key={i} className="h-64 bg-gray-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              }>
                <CityListingsClient
                  stateSlug={params.state}
                  citySlug={params.city}
                  stateName={stateName}
                  cityName={cityName}
                  stateCode={stateCode!}
                  allListings={allListings}
                  allFilters={allFilters}
                  filterMap={filterMap}
                  rankMap={rankMap}
                />
              </Suspense>
            </>
          );
        })()}

        {nearbyListings.length > 0 && (
          <div className="mt-14 pt-10 border-t border-gray-200">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              More Touchless Car Washes Near {cityName}
            </h2>
            <p className="text-gray-600 mb-6">
              Verified touchless options within {NEARBY_RADIUS_MILES} miles of {cityName}, {stateName} — useful when the
              in-town location is closed or out of the way.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {nearbyListings.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  href={`/state/${getStateSlug(l.state)}/${slugify(l.city)}/${l.slug}`}
                  distance={l._distance}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 text-center">
          <Button asChild variant="outline">
            <Link href={`/state/${params.state}`}>
              View all {stateName} locations
            </Link>
          </Button>
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">
          Prefer to wash at home?{' '}
          <Link
            href="/shop/touchless-car-wash-at-home"
            className="text-[#22C55E] font-medium hover:underline"
          >
            See our touchless car wash gear &amp; how-to guide &rarr;
          </Link>
        </p>

        {/* Feature filters — each chip routes to a /feature/[slug] subset page.
            Only shown for features that have ≥ MIN_LISTINGS_FOR_FEATURE_PAGE matches
            in this city. Drives both PV/session (new internal click target) and
            captures long-tail intent like "touchless car wash open 24 hours in X". */}
        {(() => {
          const availableFilters = FEATURE_FILTERS.filter(
            (f) => allListings.filter((l) => f.matches(l)).length >= MIN_LISTINGS_FOR_FEATURE_PAGE,
          );
          if (availableFilters.length === 0) return null;
          return (
            <div className="mt-14 pt-10 border-t border-gray-200">
              <h2 className="text-xl font-bold text-foreground mb-2">Filter touchless washes in {cityName}</h2>
              <p className="text-sm text-gray-500 mb-4">Browse by what matters to you.</p>
              <div className="flex flex-wrap gap-3">
                {availableFilters.map((f) => {
                  const matchCount = allListings.filter((l) => f.matches(l)).length;
                  return (
                    <Link
                      key={f.slug}
                      href={`/state/${params.state}/${params.city}/feature/${f.slug}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-50 text-[#0F2744] hover:bg-blue-100 text-sm font-medium transition-colors border border-blue-100"
                    >
                      {f.displayName}
                      <span className="text-xs text-gray-500">({matchCount})</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {nearbyCities.length > 0 && (
          <div className="mt-14 pt-10 border-t border-gray-200">
            <h2 className="text-xl font-bold text-foreground mb-4">Nearby Cities in {stateName}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {nearbyCities.slice(0, 20).map(c => (
                <Link
                  key={c.city}
                  href={`/state/${params.state}/${c.slug}`}
                  className="flex flex-col items-center px-3 py-3 rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-700 text-sm text-gray-700 transition-colors border border-gray-200 hover:border-blue-200 text-center"
                >
                  <span className="font-medium">{c.city}</span>
                  <span className="text-xs text-gray-400 mt-0.5">{c.count} location{c.count !== 1 ? 's' : ''}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <RelatedReading />

        <div className="mt-14 pt-10 border-t border-gray-200">
          <h2 className="text-xl font-bold text-foreground mb-6">Frequently Asked Questions</h2>
          <div className="space-y-5">
            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-[#0F2744] mb-2">
                How many touchless car washes are in {cityName}?
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                There are <strong>{allListings.length}</strong> verified touchless car wash{allListings.length !== 1 ? 'es' : ''} in {cityName}, {stateName}.
              </p>
            </div>

            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-[#0F2744] mb-2">
                {allListings.length === 1
                  ? `What is the touchless car wash in ${cityName}?`
                  : `What is the highest rated touchless car wash in ${cityName}?`}
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">{highestRatedAnswer}</p>
            </div>

            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-[#0F2744] mb-2">
                {allListings.length === 1
                  ? `How many reviews does the touchless car wash in ${cityName} have?`
                  : `Which touchless car wash in ${cityName} has the most reviews?`}
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">{mostReviewedAnswer}</p>
            </div>

            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-[#0F2744] mb-2">
                Are touchless car washes safe for my car?
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Yes. Touchless car washes use high-pressure water jets and specialized detergents instead of physical
                brushes or cloth. This eliminates the risk of swirl marks, micro-scratches, and paint damage that can
                occur with traditional brush-based washes — making them the safest automated wash option for all paint
                types, clear coats, ceramic coatings, and PPF. Owners of Tesla, BMW, Mercedes-Benz, Lexus, Audi, and
                other high-end vehicles choose touchless washes specifically to protect their finish.
              </p>
            </div>

            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-[#0F2744] mb-2">
                What&apos;s the difference between touchless and brushless car washes?
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                The terms are often used interchangeably. Both refer to car wash systems that clean your vehicle
                without abrasive contact. Touchless washes rely entirely on high-pressure water and chemical cleaners.
                Brushless washes may use soft foam or cloth that makes gentle contact, but without the hard nylon
                bristles that cause scratching. All listings on this directory use non-contact or near-contact methods
                that are safe for vehicle paint.
              </p>
            </div>

            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-[#0F2744] mb-2">
                Is a laser car wash the same as a touchless car wash?
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Yes. Laser car washes — also called touch-free or no-touch car washes — use high-pressure water jets
                and detergents instead of brushes or cloth. The term &quot;laser&quot; refers to the sensor technology
                used to detect your vehicle&apos;s shape and size, not actual lasers doing the cleaning. The result is
                the same contactless, scratch-free wash as any other touchless system.
              </p>
            </div>

            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-[#0F2744] mb-2">
                Are touchless car washes scratch-free?
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Yes. Because touchless (also called brushless or contactless) car washes never physically touch your
                vehicle, they eliminate the risk of scratches and swirl marks that brush-based washes can leave behind.
                High-pressure water and specially formulated detergents do all the cleaning, making them the safest
                automated option for any paint type or finish — from everyday vehicles to luxury brands like Tesla,
                BMW, Mercedes-Benz, Lexus, and Porsche.
              </p>
            </div>

            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-[#0F2744] mb-2">
                Are touchless car washes safe for Tesla, BMW, and other luxury vehicles?
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Yes. Touchless car washes are the safest automated wash option for luxury and high-end vehicles
                including Tesla, BMW, Mercedes-Benz, Lexus, Audi, and Porsche. Because no brushes or cloth touch
                your vehicle, there&apos;s zero risk of scratching delicate paint, clear coats, ceramic coatings,
                or paint protection film (PPF). If you&apos;ve invested in protecting your vehicle&apos;s finish,
                a touchless or touch-free car wash is the recommended choice.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
