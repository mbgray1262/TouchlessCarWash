import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase, type Listing } from '@/lib/supabase';
import { US_STATES, getStateName, slugify } from '@/lib/constants';
import { ListingCard } from '@/components/ListingCard';
import type { Metadata } from 'next';

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

async function getCityListings(stateCode: string, citySlug: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('is_touchless', true)
    .eq('state', stateCode)
    .order('rating', { ascending: false });

  if (error || !data) return [];

  return data.filter(
    (l: Listing) => l.city.toLowerCase().replace(/\s+/g, '-') === citySlug
  );
}

async function getCitiesInState(stateCode: string, excludeCitySlug: string): Promise<{ city: string; count: number; slug: string }[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('city')
    .eq('is_touchless', true)
    .eq('state', stateCode);

  if (error || !data) return [];

  const cityMap: Record<string, number> = {};
  for (const row of data) {
    if (row.city) cityMap[row.city] = (cityMap[row.city] ?? 0) + 1;
  }

  return Object.entries(cityMap)
    .map(([city, count]) => ({
      city,
      count,
      slug: city.toLowerCase().replace(/\s+/g, '-'),
    }))
    .filter(c => c.slug !== excludeCitySlug)
    .sort((a, b) => b.count - a.count);
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const stateCode = getStateCode(params.state);
  if (!stateCode) return { title: 'Not Found' };
  const cityName = unslugCity(params.city);
  const stateName = getStateName(stateCode);

  const listings = await getCityListings(stateCode, params.city);

  return {
    title: `Touchless Car Washes in ${cityName}, ${stateCode} | ${cityName} Car Wash Directory`,
    description: `Find ${listings.length} touchless car washes in ${cityName}, ${stateName}. Compare ratings, read reviews, and get directions. All locations verified touchless.`,
  };
}

export default async function CityPage({ params }: CityPageProps) {
  const stateCode = getStateCode(params.state);
  if (!stateCode) notFound();

  const stateName = getStateName(stateCode!);
  const cityName = unslugCity(params.city);
  const [listings, nearbyCities] = await Promise.all([
    getCityListings(stateCode!, params.city),
    getCitiesInState(stateCode!, params.city),
  ]);

  if (listings.length === 0) {
    return (
      <div className="min-h-screen py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
            <Link href="/" className="hover:text-[#0F2744] transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <Link href={`/car-washes/${params.state}`} className="hover:text-[#0F2744] transition-colors">{stateName}</Link>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <span className="text-[#0F2744] font-medium">{cityName}</span>
          </nav>
          <h1 className="text-4xl font-bold text-[#0F2744] mb-4">Touchless Car Washes in {cityName}, {stateCode}</h1>
          <p className="text-lg text-muted-foreground mb-6">No listings found in {cityName} yet.</p>
          <Button asChild variant="outline">
            <Link href={`/car-washes/${params.state}`}>Browse all of {stateName}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const topRated = listings.find(l => l.rating != null) ?? listings[0];

  const localBusinessJsonLd = listings.map((listing) => ({
    '@context': 'https://schema.org',
    '@type': 'AutoWash',
    name: listing.name,
    description: `Touchless car wash in ${cityName}, ${stateCode}`,
    url: listing.website ?? undefined,
    telephone: listing.phone ?? undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: listing.address ?? undefined,
      addressLocality: listing.city,
      addressRegion: listing.state,
      postalCode: listing.zip ?? undefined,
      addressCountry: 'US',
    },
    ...(listing.rating != null ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: listing.rating, bestRating: 5 } } : {}),
  }));

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `How many touchless car washes are in ${cityName}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `There are ${listings.length} verified touchless car wash${listings.length !== 1 ? 'es' : ''} in ${cityName}, ${stateName}.`,
        },
      },
      {
        '@type': 'Question',
        name: `What is the highest rated touchless car wash in ${cityName}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: topRated.rating
            ? `${topRated.name} is the top-rated touchless car wash in ${cityName} with a ${topRated.rating}-star rating.`
            : `${topRated.name} is a highly regarded touchless car wash in ${cityName}.`,
        },
      },
      {
        '@type': 'Question',
        name: 'Are touchless car washes safe for my car?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Touchless car washes use high-pressure water jets and specialized detergents instead of physical brushes or cloth. This eliminates the risk of swirl marks, micro-scratches, and paint damage that can occur with traditional brush-based washes, making them the safest automated wash option for all paint types, clear coats, and finishes.',
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
    ],
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
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
            <Link href={`/car-washes/${params.state}`} className="hover:text-white transition-colors">{stateName}</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">{cityName}</span>
          </nav>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Touchless Car Washes in {cityName}, {stateCode}
          </h1>
          <p className="text-white/80 text-lg">
            {listings.length} verified touchless car wash{listings.length !== 1 ? 'es' : ''} in {cityName}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-10">

        <div className="mb-8 p-5 bg-blue-50 border border-blue-100 rounded-xl">
          <p className="text-gray-700 text-base leading-relaxed">
            Find the best touchless car washes in {cityName}, {stateName}. We&apos;ve verified{' '}
            <strong>{listings.length} location{listings.length !== 1 ? 's' : ''}</strong> that offer brushless,
            touchless washing to keep your car&apos;s paint and finish scratch-free.
            {topRated.rating && (
              <> Top-rated option: <strong>{topRated.name}</strong> ({topRated.rating} stars).</>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              href={`/car-washes/${params.state}/${params.city}/${listing.slug}`}
            />
          ))}
        </div>

        <div className="mt-10 text-center">
          <Button asChild variant="outline">
            <Link href={`/car-washes/${params.state}`}>
              View all {stateName} locations
            </Link>
          </Button>
        </div>

        {nearbyCities.length > 0 && (
          <div className="mt-14 pt-10 border-t border-gray-200">
            <h2 className="text-xl font-bold text-foreground mb-4">Nearby Cities in {stateName}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {nearbyCities.slice(0, 20).map(c => (
                <Link
                  key={c.city}
                  href={`/car-washes/${params.state}/${c.slug}`}
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
                There are <strong>{listings.length}</strong> verified touchless car wash{listings.length !== 1 ? 'es' : ''} in {cityName}, {stateName}.
              </p>
            </div>

            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-[#0F2744] mb-2">
                What is the highest rated touchless car wash in {cityName}?
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {topRated.rating
                  ? <><strong>{topRated.name}</strong> is the top-rated touchless car wash in {cityName} with a <strong>{topRated.rating}-star</strong> rating.</>
                  : <><strong>{topRated.name}</strong> is a top touchless car wash in {cityName}.</>
                }
              </p>
            </div>

            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-[#0F2744] mb-2">
                Are touchless car washes safe for my car?
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Yes. Touchless car washes use high-pressure water jets and specialized detergents instead of physical
                brushes or cloth. This eliminates the risk of swirl marks, micro-scratches, and paint damage that can
                occur with traditional brush-based washes — making them the safest automated wash option for all paint
                types, clear coats, and finishes.
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
          </div>
        </div>

      </div>
    </div>
  );
}
