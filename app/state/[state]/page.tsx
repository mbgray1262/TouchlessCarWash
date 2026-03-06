import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase, LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { US_STATES, getStateName, getStateSlug, slugify } from '@/lib/constants';
import { ListingCard } from '@/components/ListingCard';
import { Pagination, PAGE_SIZE } from '@/components/Pagination';
import type { Metadata } from 'next';

interface StatePageProps {
  params: {
    state: string;
  };
  searchParams: {
    page?: string;
  };
}

const STATE_NICKNAMES: Record<string, string> = {
  AL: 'the Heart of Dixie', AK: 'the Last Frontier', AZ: 'the Grand Canyon State',
  AR: 'the Natural State', CA: 'the Golden State', CO: 'the Centennial State',
  CT: 'the Constitution State', DE: 'the First State', FL: 'the Sunshine State',
  GA: 'the Peach State', HI: 'the Aloha State', ID: 'the Gem State',
  IL: 'the Prairie State', IN: 'the Hoosier State', IA: 'the Hawkeye State',
  KS: 'the Sunflower State', KY: 'the Bluegrass State', LA: 'the Pelican State',
  ME: 'the Pine Tree State', MD: 'the Old Line State', MA: 'the Bay State',
  MI: 'the Great Lakes State', MN: 'the Land of 10,000 Lakes', MS: 'the Magnolia State',
  MO: 'the Show Me State', MT: 'Big Sky Country', NE: 'the Cornhusker State',
  NV: 'the Silver State', NH: 'the Granite State', NJ: 'the Garden State',
  NM: 'the Land of Enchantment', NY: 'the Empire State', NC: 'the Tar Heel State',
  ND: 'the Peace Garden State', OH: 'the Buckeye State', OK: 'the Sooner State',
  OR: 'the Beaver State', PA: 'the Keystone State', RI: 'the Ocean State',
  SC: 'the Palmetto State', SD: 'the Mount Rushmore State', TN: 'the Volunteer State',
  TX: 'the Lone Star State', UT: 'the Beehive State', VT: 'the Green Mountain State',
  VA: 'the Old Dominion', WA: 'the Evergreen State', WV: 'the Mountain State',
  WI: 'the Badger State', WY: 'the Equality State',
};

function getStateCode(stateSlug: string): string | null {
  const state = US_STATES.find(s => slugify(s.name) === stateSlug);
  return state ? state.code : null;
}

// Cached so generateMetadata and component share the same result per request
const getStateListingCount = cache(async (stateCode: string): Promise<number> => {
  const { count } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('is_touchless', true)
    .eq('state', stateCode);
  return count ?? 0;
});

const getStateDescription = cache(async (stateCode: string): Promise<string | null> => {
  const { data } = await supabase
    .from('state_descriptions')
    .select('description')
    .eq('state', stateCode)
    .maybeSingle();
  return data?.description ?? null;
});

// Server-side paginated query — only fetches 12 rows with card columns
async function getStateListingsPaginated(stateCode: string, page: number): Promise<Listing[]> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_CARD_COLUMNS)
    .eq('is_touchless', true)
    .eq('state', stateCode)
    .order('rating', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching state listings:', error);
    return [];
  }

  return (data as Listing[]) || [];
}

// Uses existing RPC — returns {city, count}[] sorted by count desc
async function getCitiesInState(stateCode: string): Promise<{ city: string; count: number }[]> {
  const { data, error } = await supabase.rpc('cities_in_state_with_counts', { p_state: stateCode });
  if (error || !data) return [];
  return data as { city: string; count: number }[];
}

async function getStatesWithListings(): Promise<string[]> {
  const { data, error } = await supabase.rpc('states_with_touchless_listings');
  if (error || !data) return [];
  return data as string[];
}

export async function generateMetadata({ params }: StatePageProps): Promise<Metadata> {
  const stateCode = getStateCode(params.state);
  if (!stateCode) {
    return { title: 'State Not Found' };
  }

  const stateName = getStateName(stateCode);
  const now = new Date();
  const month = now.toLocaleString('default', { month: 'long' });
  const year = now.getFullYear();

  const [totalCount, stateDesc] = await Promise.all([
    getStateListingCount(stateCode),
    getStateDescription(stateCode),
  ]);

  const metaDescription = stateDesc
    ? stateDesc.substring(0, 155) + (stateDesc.length > 155 ? '...' : '')
    : `Find ${totalCount} verified touchless & touch-free car washes in ${stateName}. Browse laser car wash and no-touch locations by city with ratings, hours, and contact info. Updated ${month} ${year}.`;

  const canonicalUrl = `https://touchlesscarwashfinder.com/state/${params.state}`;

  return {
    title: `Touchless Car Washes in ${stateName}`,
    description: metaDescription,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `Touchless Car Washes in ${stateName} | Touchless Car Wash Finder`,
      description: metaDescription,
      url: canonicalUrl,
      siteName: 'Touchless Car Wash Finder',
      type: 'website',
    },
  };
}

export default async function StatePage({ params, searchParams }: StatePageProps) {
  const stateCode = getStateCode(params.state);

  if (!stateCode) {
    notFound();
  }

  const stateName = getStateName(stateCode);
  const currentPage = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const [totalCount, citiesData, statesWithListings, stateDescription, paginatedListings] = await Promise.all([
    getStateListingCount(stateCode),
    getCitiesInState(stateCode),
    getStatesWithListings(),
    getStateDescription(stateCode),
    getStateListingsPaginated(stateCode, currentPage),
  ]);

  if (totalCount === 0) {
    return (
      <div className="min-h-screen">
        <div className="bg-[#0F2744] py-10">
          <div className="container mx-auto px-4 max-w-6xl">
            <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <Link href="/states" className="hover:text-white transition-colors">States</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-white">{stateName}</span>
            </nav>
            <h1 className="text-4xl font-bold text-white mb-3">Touchless Car Washes in {stateName}</h1>
            <p className="text-white/70">No listings found in {stateName} yet. Check back soon!</p>
          </div>
        </div>
      </div>
    );
  }

  // Sort cities alphabetically for display
  const cities = [...citiesData].sort((a, b) => a.city.localeCompare(b.city));
  const nickname = STATE_NICKNAMES[stateCode] ?? stateName;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const page = Math.min(currentPage, totalPages);

  const nearbyStates = statesWithListings
    .filter(s => s !== stateCode)
    .map(s => ({ code: s, name: getStateName(s), slug: getStateSlug(s) }));

  const now = new Date();
  const month = now.toLocaleString('default', { month: 'long' });
  const year = now.getFullYear();

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://touchlesscarwashfinder.com' },
      { '@type': 'ListItem', position: 2, name: 'States', item: 'https://touchlesscarwashfinder.com/states' },
      { '@type': 'ListItem', position: 3, name: stateName, item: `https://touchlesscarwashfinder.com/state/${params.state}` },
    ],
  };

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Touchless Car Washes in ${stateName} by City`,
    description: `Cities in ${stateName} with verified touchless, touch-free, and no-touch car wash locations`,
    numberOfItems: cities.length,
    itemListElement: cities.map((c, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: `Touchless Car Washes in ${c.city}, ${stateCode}`,
      url: `https://touchlesscarwashfinder.com/state/${params.state}/${c.city.toLowerCase().replace(/\s+/g, '-')}`,
    })),
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

      <div className="bg-[#0F2744] py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/states" className="hover:text-white transition-colors">States</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">{stateName}</span>
          </nav>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Touchless Car Washes in {stateName}
          </h1>
          <p className="text-white/70 text-lg">
            {totalCount} verified touchless car wash{totalCount !== 1 ? 'es' : ''} across {cities.length} {cities.length === 1 ? 'city' : 'cities'}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto pt-8">

          <div className="mb-8 p-5 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-gray-700 text-base leading-relaxed">
              {stateDescription ? stateDescription : (
                <>
                  Browse <strong>{totalCount} verified touchless, touch-free, and laser car wash{totalCount !== 1 ? ' locations' : ' location'}</strong>{' '}
                  across <strong>{cities.length} {cities.length === 1 ? 'city' : 'cities'}</strong> in {nickname}.
                  Every listing is confirmed to offer brushless, no-touch washing that&apos;s safe for all paint
                  types and finishes — no bristles, no scratches, no swirl marks. Last updated {month} {year}.
                </>
              )}
            </p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">Browse by City</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {cities.map((c) => (
                <Link
                  key={c.city}
                  href={`/state/${params.state}/${c.city.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
                    <CardContent className="p-4">
                      <div className="font-semibold text-foreground">{c.city}</div>
                      <div className="text-sm text-muted-foreground">
                        {c.count} location{c.count !== 1 ? 's' : ''}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-12">
            <h2 className="text-2xl font-bold text-foreground mb-6">
              All Locations
              {totalPages > 1 && <span className="text-base font-normal text-gray-400 ml-2">Page {page} of {totalPages}</span>}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  href={`/state/${params.state}/${listing.city.toLowerCase().replace(/\s+/g, '-')}/${listing.slug}`}
                />
              ))}
            </div>
            <Pagination
              currentPage={page}
              totalItems={totalCount}
              baseHref={`/state/${params.state}`}
            />
          </div>

          <section className="mt-14 pt-10 border-t border-gray-200">
            <h2 className="text-2xl font-bold text-foreground mb-6">
              Frequently Asked Questions About Touchless Car Washes in {stateName}
            </h2>
            <div className="divide-y divide-gray-200 border border-gray-200 rounded-2xl overflow-hidden bg-white">
              <details className="group bg-white">
                <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none select-none hover:bg-gray-50 transition-colors">
                  <span className="text-base font-semibold text-gray-900">How many touchless car washes are in {stateName}?</span>
                  <span className="flex-shrink-0 w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <div className="px-6 pb-6 pt-1 text-gray-600 leading-relaxed text-sm">
                  Our directory lists {totalCount} verified touchless car wash{totalCount !== 1 ? ' locations' : ' location'} across {cities.length} {cities.length === 1 ? 'city' : 'cities'} in {stateName}. Each listing has been verified to confirm it offers true touch-free, brushless washing — no physical contact with your vehicle.
                </div>
              </details>
              <details className="group bg-white">
                <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none select-none hover:bg-gray-50 transition-colors">
                  <span className="text-base font-semibold text-gray-900">What is a touchless car wash?</span>
                  <span className="flex-shrink-0 w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <div className="px-6 pb-6 pt-1 text-gray-600 leading-relaxed text-sm">
                  A touchless car wash — also known as a touch-free, no-touch, or laser car wash — uses high-pressure water jets and specialized detergents to clean your vehicle without any physical contact from brushes, cloth, or foam pads. This brushless wash method eliminates the risk of scratches, swirl marks, and paint damage.
                </div>
              </details>
              <details className="group bg-white">
                <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none select-none hover:bg-gray-50 transition-colors">
                  <span className="text-base font-semibold text-gray-900">Are touchless car washes safe for ceramic coatings and PPF?</span>
                  <span className="flex-shrink-0 w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <div className="px-6 pb-6 pt-1 text-gray-600 leading-relaxed text-sm">
                  Yes. Touch-free, brushless car washes are the safest option for vehicles with ceramic coatings, paint protection film (PPF), vinyl wraps, or matte finishes. Because nothing physically touches the surface, there is no risk of peeling, scratching, or damaging these protective layers.
                </div>
              </details>
            </div>
          </section>

          {nearbyStates.length > 0 && (
            <div className="mt-14 pt-10 border-t border-gray-200">
              <h2 className="text-xl font-bold text-foreground mb-4">Nearby States</h2>
              <div className="flex flex-wrap gap-2">
                {nearbyStates.map(s => (
                  <Link
                    key={s.code}
                    href={`/state/${s.slug}`}
                    className="inline-flex items-center px-4 py-2 rounded-full bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-sm font-medium text-gray-700 transition-colors border border-gray-200 hover:border-blue-200"
                  >
                    {s.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
