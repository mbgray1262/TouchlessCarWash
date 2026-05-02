import { cache, Suspense } from 'react';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase, LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { US_STATES, getStateName, getStateSlug, slugify } from '@/lib/constants';
import { StateListingsClient } from '@/components/StateListingsClient';
import { RedirectBanner } from '@/components/RedirectBanner';
import { RelatedReading } from '@/components/RelatedReading';
import { getFilters, getStateListingsPaginated } from '@/lib/listing-queries';
import { FEATURES } from '@/lib/features';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

import type { Metadata } from 'next';

// ISR — regenerate every hour. Now actually works because we removed searchParams!
export const dynamic = 'force-dynamic'; // see /state/.../slug for context — Netlify CDN cache (netlify.toml) handles edge perf; force-dynamic prevents the Next.js ISR etag-based 304-without-body bug that kept breaking /blog and /best on the CDN.

interface StatePageProps {
  params: {
    state: string;
  };
}

const STATE_NICKNAMES: Record<string, string> = {
  AL: 'the Heart of Dixie', AK: 'the Last Frontier', AZ: 'the Grand Canyon State',
  AR: 'the Natural State', CA: 'the Golden State', CO: 'the Centennial State',
  CT: 'the Constitution State', DE: 'the First State', DC: 'the Nation\'s Capital', FL: 'the Sunshine State',
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

// Pre-render all 51 state pages at build time
export function generateStaticParams() {
  return US_STATES.map(s => ({ state: slugify(s.name) }));
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

// Returns the STATIC TEMPLATE with placeholders like {{TOTAL_LISTINGS}}.
// The placeholders get substituted at render time via renderStateDescription
// so counts stay fresh even when listings are added/removed from the DB
// (no stale-number problem — GSC flagged these as "duplicate without
// user-selected canonical" when counts went stale).
const getStateDescriptionTemplate = cache(async (stateCode: string): Promise<string | null> => {
  const { data } = await supabase
    .from('state_descriptions')
    .select('description')
    .eq('state', stateCode)
    .maybeSingle();
  return data?.description ?? null;
});

/**
 * Substitute {{TOTAL_LISTINGS}}, {{UNIQUE_CITIES}}, {{TOP_CITY}},
 * {{TOP_CITY_COUNT}} with live values at render time.
 */
function renderStateDescription(
  template: string | null,
  stats: { total: number; uniqueCities: number; topCity?: string; topCityCount?: number },
): string | null {
  if (!template) return null;
  return template
    .replace(/\{\{TOTAL_LISTINGS\}\}/g, String(stats.total))
    .replace(/\{\{UNIQUE_CITIES\}\}/g, String(stats.uniqueCities))
    .replace(/\{\{TOP_CITY\}\}/g, stats.topCity ?? '')
    .replace(/\{\{TOP_CITY_COUNT\}\}/g, String(stats.topCityCount ?? 0));
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

  const [totalCount, descTemplate, citiesData] = await Promise.all([
    getStateListingCount(stateCode),
    getStateDescriptionTemplate(stateCode),
    getCitiesInState(stateCode),
  ]);

  // Substitute placeholders with live counts so the meta description
  // never goes stale as listings are added/removed from the DB
  const stateDesc = renderStateDescription(descTemplate, {
    total: totalCount,
    uniqueCities: citiesData.length,
    topCity: citiesData[0]?.city,
    topCityCount: citiesData[0]?.count,
  });

  const metaDescription = stateDesc
    ? stateDesc.substring(0, 155) + (stateDesc.length > 155 ? '...' : '')
    : `Find a touchless car wash near you in ${stateName} — ${totalCount}+ verified no-touch, brushless & contactless locations with ratings, hours, and directions.`;

  const canonicalUrl = `https://touchlesscarwashfinder.com/state/${params.state}`;
  // Title leads with "Near Me" intent — GSC shows the bulk of state-page
  // impressions come from "touchless car wash near me" and variants
  // (9,921 imp/90d for the head term alone). Page used to rank ~pos 9.8;
  // adding the explicit intent match should clear the page-1 gap.
  const title = `Touchless Car Wash Near Me in ${stateName} — ${month} ${year}`;

  return {
    title,
    description: metaDescription,
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

export default async function StatePage({ params }: StatePageProps) {
  const stateCode = getStateCode(params.state);

  if (!stateCode) {
    notFound();
  }

  const stateName = getStateName(stateCode);

  // Fetch ALL base data in a single parallel stage — no waterfalls
  const [allFilters, totalCount, citiesData, statesWithListings, descTemplate, initialListings, featureCountsRaw] = await Promise.all([
    getFilters(),
    getStateListingCount(stateCode),
    getCitiesInState(stateCode),
    getStatesWithListings(),
    getStateDescriptionTemplate(stateCode),
    // Fetch first page of listings (no filters) for the static render
    getStateListingsPaginated(stateCode, 1, null),
    // Fetch feature counts in a single parallel batch
    Promise.all(
      FEATURES.map(async (f) => {
        const { data } = await supabase.rpc('feature_state_counts', { p_filter_slug: f.slug });
        const match = (data as { state: string; count: number }[] | null)?.find((r) => r.state === stateCode);
        return match ? { slug: f.slug, name: f.name, count: Number(match.count) } : null;
      }),
    ),
  ]);

  // Substitute live counts into the description template — counts stay
  // fresh across every render (no stale-number dupe-content issue)
  const stateDescription = renderStateDescription(descTemplate, {
    total: totalCount,
    uniqueCities: citiesData.length,
    topCity: citiesData[0]?.city,
    topCityCount: citiesData[0]?.count,
  });

  const availableFeatures = featureCountsRaw.filter((f): f is { slug: string; name: string; count: number } => f !== null && f.count >= 3);

  // State has no approved touchless listings (e.g. DC, where every listing
  // is non-touchless or unapproved). Mirror the city-page pattern: 308
  // redirect to the all-states index with a flag so RedirectBanner can
  // explain to the visitor what happened, rather than hard-404ing.
  // Middleware tags ?from= URLs as noindex so Google won't index the
  // redirected URL but will still follow the 308 to consolidate any
  // remaining authority on /states.
  if (totalCount === 0) {
    permanentRedirect(`/states?from=empty-state&orig=${encodeURIComponent(params.state)}`);
  }

  // Top cities by listing count (citiesData is already sorted desc by count from the RPC)
  const topCities = citiesData.length > 5 ? citiesData.slice(0, 5) : [];

  // Sort cities alphabetically for the full browse list
  const cities = [...citiesData].sort((a, b) => a.city.localeCompare(b.city));
  const nickname = STATE_NICKNAMES[stateCode] ?? stateName;

  const validStateCodes = new Set(US_STATES.map(s => s.code));
  const nearbyStates = statesWithListings
    .filter(s => s !== stateCode && validStateCodes.has(s))
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
      url: `https://touchlesscarwashfinder.com/state/${params.state}/${slugify(c.city)}`,
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
      <RedirectBanner />

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
            Touchless Car Wash Near Me in {stateName}
          </h1>
          <p className="text-white/70 text-lg">
            {totalCount} verified touchless, no-touch &amp; brushless car wash{totalCount !== 1 ? 'es' : ''} near you across {cities.length} {cities.length === 1 ? 'city' : 'cities'} in {stateName}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto pt-8">

          <div className="mb-8 p-5 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-gray-700 text-base leading-relaxed">
              {stateDescription ? stateDescription : (
                <>
                  Browse <strong>{totalCount} verified touchless, brushless & automatic car wash{totalCount !== 1 ? ' locations' : ' location'}</strong>{' '}
                  across <strong>{cities.length} {cities.length === 1 ? 'city' : 'cities'}</strong> in {nickname}.
                  Every listing is confirmed to offer brushless, no-touch washing that&apos;s safe for all paint
                  types and finishes — no bristles, no scratches, no swirl marks. Last updated {month} {year}.
                </>
              )}
            </p>
          </div>

          {topCities.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4">Popular Cities</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {topCities.map((c) => (
                  <Link
                    key={c.city}
                    href={`/state/${params.state}/${slugify(c.city)}`}
                  >
                    <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer border-primary/30 bg-primary/5">
                      <CardContent className="p-4">
                        <div className="font-bold text-foreground">{c.city}</div>
                        <div className="text-sm text-primary font-medium">
                          {c.count} location{c.count !== 1 ? 's' : ''}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">Browse by City</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {cities.map((c) => (
                <Link
                  key={c.city}
                  href={`/state/${params.state}/${slugify(c.city)}`}
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

          {availableFeatures.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4">Browse by Feature</h2>
              <div className="flex flex-wrap gap-2">
                {availableFeatures.map((f) => (
                  <Link
                    key={f.slug}
                    href={`/features/${f.slug}/${params.state}`}
                    className="inline-flex items-center px-4 py-2 rounded-full bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-sm font-medium text-gray-700 transition-colors border border-gray-200 hover:border-blue-200"
                  >
                    {f.name} ({f.count})
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Listings section — client component handles filter/pagination */}
          <Suspense fallback={
            <div className="mt-12">
              <h2 className="text-2xl font-bold text-foreground mb-6">
                All Locations <span className="text-lg font-normal text-gray-400">({totalCount})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="h-64 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          }>
            <StateListingsClient
              stateCode={stateCode}
              stateSlug={params.state}
              stateName={stateName}
              initialListings={initialListings}
              totalCount={totalCount}
              allFilters={allFilters}
            />
          </Suspense>

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
                  A touchless car wash — also known as a touch-free, no-touch, automatic, or laser car wash — uses high-pressure water jets and specialized detergents to clean your vehicle without any physical contact from brushes, cloth, or foam pads. This brushless, automatic wash method eliminates the risk of scratches, swirl marks, and paint damage.
                </div>
              </details>
              <details className="group bg-white">
                <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none select-none hover:bg-gray-50 transition-colors">
                  <span className="text-base font-semibold text-gray-900">Are touchless car washes safe for ceramic coatings and PPF?</span>
                  <span className="flex-shrink-0 w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <div className="px-6 pb-6 pt-1 text-gray-600 leading-relaxed text-sm">
                  Yes. Touch-free, brushless car washes are the safest option for vehicles with ceramic coatings, paint protection film (PPF), vinyl wraps, or matte finishes. Because nothing physically touches the surface, there is no risk of peeling, scratching, or damaging these protective layers. This is why owners of Tesla, BMW, Mercedes-Benz, Lexus, Audi, and Porsche vehicles frequently choose touchless washes to protect their investment.
                </div>
              </details>
              <details className="group bg-white">
                <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none select-none hover:bg-gray-50 transition-colors">
                  <span className="text-base font-semibold text-gray-900">Are touchless car washes safe for Tesla, BMW, and other luxury vehicles?</span>
                  <span className="flex-shrink-0 w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <div className="px-6 pb-6 pt-1 text-gray-600 leading-relaxed text-sm">
                  Absolutely. Touchless car washes are the safest automated wash option for luxury and high-end vehicles including Tesla Model 3, Model Y, and Model S, BMW 3/5/X Series, Mercedes-Benz C/E-Class, Lexus, Audi, Porsche, Range Rover, and Genesis. Because no brushes or cloth contact your vehicle, there is zero risk of scratching delicate paint, clear coats, ceramic coatings, or paint protection film (PPF). Luxury car owners and auto detailing professionals consistently recommend touch-free washes for preserving showroom-quality finishes.
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

          <RelatedReading />

        </div>
      </div>
    </div>
  );
}
