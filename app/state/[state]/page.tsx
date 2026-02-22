import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase, type Listing } from '@/lib/supabase';
import { US_STATES, getStateName, getStateSlug, slugify } from '@/lib/constants';
import { ListingCard } from '@/components/ListingCard';
import type { Metadata } from 'next';

interface StatePageProps {
  params: {
    state: string;
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

export async function generateMetadata({ params }: StatePageProps): Promise<Metadata> {
  const stateCode = getStateCode(params.state);
  if (!stateCode) {
    return { title: 'State Not Found' };
  }

  const stateName = getStateName(stateCode);
  const now = new Date();
  const month = now.toLocaleString('default', { month: 'long' });
  const year = now.getFullYear();

  const { count } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('is_touchless', true)
    .eq('state', stateCode);

  return {
    title: `Touchless Car Washes in ${stateName} | ${stateName} Car Wash Directory`,
    description: `Find ${count ?? 0} verified touchless & touch-free car washes in ${stateName}. Browse laser car wash and no-touch locations by city with ratings, hours, and contact info. Updated ${month} ${year}.`,
  };
}

async function getStateListings(stateCode: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('is_touchless', true)
    .eq('state', stateCode)
    .order('rating', { ascending: false });

  if (error) {
    console.error('Error fetching state listings:', error);
    return [];
  }

  return data || [];
}

async function getStatesWithListings(): Promise<string[]> {
  const { data, error } = await supabase.rpc('states_with_touchless_listings');
  if (error || !data) return [];
  return data as string[];
}

export default async function StatePage({ params }: StatePageProps) {
  const stateCode = getStateCode(params.state);

  if (!stateCode) {
    notFound();
  }

  const stateName = getStateName(stateCode);
  const [listings, statesWithListings] = await Promise.all([
    getStateListings(stateCode),
    getStatesWithListings(),
  ]);

  if (listings.length === 0) {
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

  const cities = Array.from(new Set(listings.map(l => l.city))).sort();
  const nickname = STATE_NICKNAMES[stateCode] ?? stateName;

  const nearbyStates = statesWithListings
    .filter(s => s !== stateCode)
    .map(s => ({ code: s, name: getStateName(s), slug: getStateSlug(s) }));

  const now = new Date();
  const month = now.toLocaleString('default', { month: 'long' });
  const year = now.getFullYear();

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Touchless Car Washes in ${stateName} by City`,
    description: `Cities in ${stateName} with verified touchless, touch-free, and no-touch car wash locations`,
    numberOfItems: cities.length,
    itemListElement: cities.map((city, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: `Touchless Car Washes in ${city}, ${stateCode}`,
      url: `https://touchlesswash.com/state/${params.state}/${city.toLowerCase().replace(/\s+/g, '-')}`,
    })),
  };

  return (
    <div className="min-h-screen">
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
            {listings.length} verified touchless car wash{listings.length !== 1 ? 'es' : ''} across {cities.length} {cities.length === 1 ? 'city' : 'cities'}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto pt-8">

          <div className="mb-8 p-5 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-gray-700 text-base leading-relaxed">
              Browse <strong>{listings.length} verified touchless, touch-free, and laser car wash{listings.length !== 1 ? ' locations' : ' location'}</strong>{' '}
              across <strong>{cities.length} {cities.length === 1 ? 'city' : 'cities'}</strong> in {nickname}.
              Every listing is confirmed to offer brushless, no-touch washing that&apos;s safe for all paint
              types and finishes — no bristles, no scratches, no swirl marks. Last updated {month} {year}.
            </p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">Browse by City</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {cities.map((city) => {
                const cityListings = listings.filter(l => l.city === city);
                return (
                  <Link
                    key={city}
                    href={`/state/${params.state}/${city.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
                      <CardContent className="p-4">
                        <div className="font-semibold text-foreground">{city}</div>
                        <div className="text-sm text-muted-foreground">
                          {cityListings.length} location{cityListings.length !== 1 ? 's' : ''}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-12">
            <h2 className="text-2xl font-bold text-foreground mb-6">All Locations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  href={`/state/${params.state}/${listing.city.toLowerCase().replace(/\s+/g, '-')}/${listing.slug}`}
                />
              ))}
            </div>
          </div>

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
