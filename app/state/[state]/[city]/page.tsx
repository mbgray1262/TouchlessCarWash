import { cache, Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase, LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { US_STATES, getStateName, slugify } from '@/lib/constants';
import { CityListingsClient } from '@/components/CityListingsClient';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';
import { AdUnit } from '@/components/AdUnit';
import type { Metadata } from 'next';

// ISR — regenerate every hour. Now actually works because we removed searchParams!
export const revalidate = 3600;

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

function unslugCity(citySlug: string): string {
  return citySlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Cached so generateMetadata and component share the same result per request
const getCityListings = cache(async (stateCode: string, cityName: string): Promise<Listing[]> => {
  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_CARD_COLUMNS)
    .eq('is_touchless', true)
    .eq('state', stateCode)
    .ilike('city', cityName)
    .order('rating', { ascending: false });

  if (error || !data) return [];
  return data as Listing[];
});

const getCityDescription = cache(async (stateCode: string, cityName: string): Promise<string | null> => {
  const { data } = await supabase
    .from('city_descriptions')
    .select('description')
    .eq('state', stateCode)
    .ilike('city', cityName)
    .maybeSingle();
  return data?.description ?? null;
});

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
      slug: city.toLowerCase().replace(/\s+/g, '-'),
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
  const cityName = unslugCity(params.city);
  const stateName = getStateName(stateCode);

  const [listings, cityDesc] = await Promise.all([
    getCityListings(stateCode, cityName),
    getCityDescription(stateCode, cityName),
  ]);

  const ratedListings = listings.filter(l => l.rating != null && l.rating > 0);
  const avgRating = ratedListings.length > 0
    ? (ratedListings.reduce((sum, l) => sum + l.rating, 0) / ratedListings.length).toFixed(1)
    : null;
  const totalReviews = listings.reduce((sum, l) => sum + (l.review_count ?? 0), 0);

  const ratingSnippet = avgRating && totalReviews > 0
    ? ` Avg ${avgRating}★ across ${totalReviews.toLocaleString()} reviews.`
    : '';

  const metaDescription = cityDesc
    ? cityDesc.substring(0, 155) + (cityDesc.length > 155 ? '...' : '')
    : `Find ${listings.length} touchless, brushless, contactless & no-touch car washes in ${cityName}, ${stateName}.${ratingSnippet} Verified locations with ratings, hours, and directions.`;

  const now = new Date();
  const month = now.toLocaleString('default', { month: 'long' });
  const year = now.getFullYear();
  const canonicalUrl = `https://touchlesscarwashfinder.com/state/${params.state}/${params.city}`;
  const title = `Best Touchless & Brushless Car Wash in ${cityName}, ${stateCode} — ${month} ${year}`;

  // Noindex thin city pages — too few listings to be worth indexing and can hurt
  // overall site quality score. Keep canonical so Google knows the URL is intentional.
  const thinPage = listings.length < 3;

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

  const stateName = getStateName(stateCode!);
  const cityName = unslugCity(params.city);

  // Fetch all base data in a single parallel stage — no waterfalls
  const [allListings, nearbyCities, cityDescription, allFilters] = await Promise.all([
    getCityListings(stateCode!, cityName),
    getCitiesInState(stateCode!, params.city),
    getCityDescription(stateCode!, cityName),
    getFilters(),
  ]);

  // Return proper 404 for cities with no listings at all.
  if (allListings.length === 0) {
    notFound();
  }

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
            Touchless & Brushless Car Washes in {cityName}, {stateCode}
          </h1>
          <p className="text-white/80 text-lg">
            {allListings.length} verified touchless car wash{allListings.length !== 1 ? 'es' : ''} in {cityName}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-10">

        <div className="mb-8 p-5 bg-blue-50 border border-blue-100 rounded-xl">
          <p className="text-gray-700 text-base leading-relaxed">
            {cityDescription ? cityDescription : (
              <>
                Find the best {introSynonyms} car washes in {cityName}, {stateName}. We&apos;ve verified{' '}
                <strong>{allListings.length} location{allListings.length !== 1 ? 's' : ''}</strong> that offer brushless,
                contactless washing to keep your car&apos;s paint and finish scratch-free.
                {topRated.rating && (
                  <> Top-rated option: <strong>{topRated.name}</strong> ({topRated.rating} stars).</>
                )}
              </>
            )}
          </p>
        </div>

        {/* Listings section — client component handles filter/pagination */}
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
          />
        </Suspense>

        <div className="mt-10 text-center">
          <Button asChild variant="outline">
            <Link href={`/state/${params.state}`}>
              View all {stateName} locations
            </Link>
          </Button>
        </div>

        <AdUnit className="mt-10" format="horizontal" />

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
