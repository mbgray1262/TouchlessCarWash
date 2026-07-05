import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Clock } from 'lucide-react';
import { ListingCard } from '@/components/ListingCard';
import { LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { publicListings } from '@/lib/public-listings';
import { US_STATES, getStateName, getStateSlug, slugify } from '@/lib/constants';
import { is24h } from '@/lib/state-hub-filters';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 3600;

const SITE_URL = 'https://touchlesscarwashfinder.com';

function getStateCode(slug: string): string | null {
  const s = US_STATES.find(s => getStateSlug(s.code) === slug);
  return s ? s.code : null;
}

export function generateStaticParams() {
  return US_STATES.map(s => ({ state: getStateSlug(s.code) }));
}

/** Fetch all approved touchless listings for a state, paginating past 1000-row cap. */
async function getAllStateListings(stateCode: string): Promise<Listing[]> {
  const all: Listing[] = [];
  const BATCH = 1000;
  let offset = 0;
  while (true) {
    const { data } = await publicListings(LISTING_CARD_COLUMNS)
      .eq('state', stateCode)
      .range(offset, offset + BATCH - 1);
    if (!data || data.length === 0) break;
    all.push(...(data as Listing[]));
    if (data.length < BATCH) break;
    offset += BATCH;
  }
  return all;
}

export async function generateMetadata({
  params,
}: {
  params: { state: string };
}): Promise<Metadata> {
  const stateCode = getStateCode(params.state);
  if (!stateCode) return { title: 'Not Found' };
  const stateName = getStateName(stateCode);
  const year = new Date().getFullYear();
  const title = `24 Hour Touchless Car Wash in ${stateName} — Open Now (${year})`;
  const description = `Find touchless car washes open 24 hours a day in ${stateName}. Fully automated, brushless, no-contact — available any time of day or night. Verified hours and directions.`;
  // Self-canonical. "24-hour touchless car wash in <state>" is a distinct,
  // useful query and a genuine subset of /state/<state>, not a duplicate — and
  // this page is indexable and listed in the sitemap (mirroring its sister
  // /unlimited-touchless-car-wash/<state> page). Pointing the canonical here
  // keeps the index/canonical/sitemap signals consistent instead of leaking
  // authority to the state hub.
  const canonical = `${SITE_URL}/24-hour-touchless-car-wash/${params.state}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Touchless Car Wash Finder',
      type: 'website',
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function TwentyFourHourStatePage({
  params,
}: {
  params: { state: string };
}) {
  const stateCode = getStateCode(params.state);
  if (!stateCode) notFound();
  const stateName = getStateName(stateCode);
  const year = new Date().getFullYear();

  const allListings = await getAllStateListings(stateCode);
  const listings24h = allListings.filter(l => is24h(l.hours as Record<string, string> | null));

  if (listings24h.length === 0) notFound();

  // Group by city for summary
  const cityCount: Record<string, number> = {};
  for (const l of listings24h) {
    cityCount[l.city] = (cityCount[l.city] ?? 0) + 1;
  }
  const topCities = Object.entries(cityCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([city]) => city);

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: '24 Hour Touchless Car Wash', item: `${SITE_URL}/24-hour-touchless-car-wash` },
      { '@type': 'ListItem', position: 3, name: stateName, item: `${SITE_URL}/24-hour-touchless-car-wash/${params.state}` },
    ],
  };

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      {/* Hero */}
      <div className="bg-[#0F2744]">
        <div className="container mx-auto px-4 max-w-6xl py-12 md:py-16">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/24-hour-touchless-car-wash" className="hover:text-white transition-colors">24 Hour Touchless Car Wash</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">{stateName}</span>
          </nav>
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-8 h-8 text-[#22C55E]" />
            <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
              24 Hour Touchless Car Wash in {stateName}
            </h1>
          </div>
          <p className="text-lg text-blue-100 max-w-3xl">
            {listings24h.length} touchless car washes confirmed open 24 hours a day in {stateName}.
            Fully automated, brushless, scratch-free — available any time.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-8">

        {/* Why touchless = 24h */}
        <div className="bg-blue-50 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-bold text-[#0F2744] mb-3">
            Why touchless car washes in {stateName} can stay open all night
          </h2>
          <p className="text-gray-700 leading-relaxed">
            Every location on this page is a fully automated touchless in-bay wash — you pay at the kiosk, pull in, and the equipment does the rest without any staff. Unlike tunnel washes that need attendants and have closing times, touchless bays run the same at 2am as they do at noon. Many are located at 24-hour gas stations with security cameras and good lighting.
          </p>
        </div>

        {/* Top cities */}
        {topCities.length > 0 && (
          <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-800">Cities with 24-hour touchless washes:</span>{' '}
              {topCities.map((city, i) => (
                <span key={city}>
                  <Link
                    href={`/state/${params.state}/${slugify(city)}`}
                    className="text-blue-600 hover:underline"
                  >
                    {city}
                  </Link>
                  {i < topCities.length - 1 ? ', ' : ''}
                </span>
              ))}
              {Object.keys(cityCount).length > 5 && ` and ${Object.keys(cityCount).length - 5} more`}
            </p>
          </div>
        )}

        {/* Listings */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {listings24h.length} touchless car washes open 24/7 in {stateName}
          </h2>
          <p className="text-gray-600 text-sm mb-6">
            Hours verified from Google. Click any location for directions and full details.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings24h
              .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
              .map(listing => (
                <ListingCard key={listing.id} listing={listing} showVerifiedBadge />
              ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-4">Frequently asked questions</h2>
          <div className="space-y-3">
            {[
              {
                q: `How many 24-hour touchless car washes are in ${stateName}?`,
                a: `We have verified ${listings24h.length} touchless car washes in ${stateName} with confirmed 24-hour hours as of ${year}. These are all fully automated in-bay automatic washes — no staff required.`,
              },
              {
                q: 'Do 24-hour touchless car washes stay open on holidays?',
                a: 'Most 24-hour touchless bays remain open on holidays since they are fully automated — there is no staff to call off. Some locations at gas stations may have slightly adjusted hours around major holidays, so it\'s worth checking the individual listing before driving over.',
              },
              {
                q: `Are 24-hour car washes in ${stateName} safe to use at night?`,
                a: `Most 24-hour touchless locations in ${stateName} are attached to gas stations or busy commercial areas with lighting and security cameras. Use common sense — pick well-lit, busy locations and keep your doors locked during the wash.`,
              },
            ].map(({ q, a }) => (
              <div key={q} className="border border-gray-200 rounded-lg p-5 bg-white">
                <h3 className="font-semibold text-[#0F2744] mb-2 text-sm">{q}</h3>
                <p className="text-gray-700 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Cross-links */}
        <div className="p-6 bg-[#0F2744] rounded-2xl text-center">
          <p className="text-white font-semibold text-lg mb-2">
            Want unlimited washes at any hour?
          </p>
          <p className="text-white/70 text-sm mb-4">
            Many 24-hour touchless locations in {stateName} also offer monthly unlimited memberships.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href={`/unlimited-touchless-car-wash/${params.state}`}
              className="inline-flex items-center gap-1.5 bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              Unlimited plans in {stateName}
            </Link>
            <Link
              href={`/state/${params.state}`}
              className="inline-flex items-center gap-1.5 bg-white text-[#0F2744] hover:bg-gray-100 font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              All {stateName} listings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
