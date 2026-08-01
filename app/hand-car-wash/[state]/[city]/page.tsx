import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight, MapPin } from 'lucide-react';
import { ListingCard } from '@/components/ListingCard';
import { LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { HAND_WASH_LIVE, publicHandWashListings, MIN_HAND_WASH_CITY, qualifyingHandWashCities } from '@/lib/hand-wash';
import { US_STATES, getStateName, slugify } from '@/lib/constants';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PATH = '/hand-car-wash';

export const revalidate = 3600;

interface Props { params: { state: string; city: string } }

function codeFromSlug(stateSlug: string): string | null {
  const s = US_STATES.find(x => slugify(x.name) === stateSlug);
  return s ? s.code : null;
}

// Pre-render exactly the cities that qualify for a hub (>= MIN_HAND_WASH_CITY).
// The runtime 404 below (same threshold, same slug grouping) guards any others.
export async function generateStaticParams() {
  const cities = await qualifyingHandWashCities();
  return cities.map(c => ({ state: c.stateSlug, city: c.citySlug }));
}

// All public hand-wash listings in this state whose city slug matches the URL.
// Resolving by slug (not raw name) matches qualifyingHandWashCities()'s grouping,
// so the page's count and the sitemap's threshold decision can never disagree.
async function getCityListings(code: string, citySlug: string): Promise<Listing[]> {
  const { data } = await publicHandWashListings(LISTING_CARD_COLUMNS)
    .eq('state', code)
    .order('name', { ascending: true })
    .limit(1000);
  return ((data ?? []) as Listing[]).filter(l => slugify(l.city || '') === citySlug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = codeFromSlug(params.state);
  if (!code) return {};
  const listings = await getCityListings(code, params.city);
  if (listings.length < MIN_HAND_WASH_CITY) return { title: 'Not Found', robots: { index: false, follow: false } };
  const cityName = listings[0].city || params.city;
  const stateName = getStateName(code);
  const n = listings.length;
  const year = new Date().getFullYear();
  const title = `Hand Car Washes in ${cityName}, ${code} — ${n} Locations | ${year}`;
  const description = `Find hand car washes in ${cityName}, ${stateName} — ${n} verified full-service hand washing and detailing locations where attendants wash your car by hand. Hours, ratings, and directions.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE_URL}${PATH}/${params.state}/${params.city}` },
    robots: HAND_WASH_LIVE ? undefined : { index: false, follow: false },
    openGraph: { title, description, url: `${SITE_URL}${PATH}/${params.state}/${params.city}`, type: 'website' },
  };
}

export default async function HandWashCityPage({ params }: Props) {
  const code = codeFromSlug(params.state);
  if (!code) notFound();
  const listings = await getCityListings(code, params.city);
  // Below the shared threshold this city has no hub — 404 (and it's never in the
  // sitemap). The single-listing case is already covered by that listing's own page.
  if (listings.length < MIN_HAND_WASH_CITY) notFound();

  const cityName = listings[0].city || params.city;
  const stateName = getStateName(code);

  return (
    <main className="min-h-screen bg-white">
      {!HAND_WASH_LIVE && (
        <div className="bg-amber-500 text-white text-center text-sm font-semibold py-2 px-4">
          PREVIEW — not live yet (hidden from Google &amp; not linked).
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1.5 flex-wrap">
          <Link href={PATH} className="hover:text-[#22C55E]">Hand Car Washes</Link>
          <ChevronRight className="w-4 h-4" />
          <Link href={`${PATH}/${params.state}`} className="hover:text-[#22C55E]">{stateName}</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-[#0F2744] font-medium">{cityName}</span>
        </nav>

        <h1 className="text-3xl font-extrabold text-[#0F2744]">Hand Car Washes in {cityName}, {stateName}</h1>
        <p className="mt-2 text-gray-600">
          {listings.length} verified hand car wash {listings.length === 1 ? 'location' : 'locations'} in {cityName} — full-service hand washing and detailing where attendants clean your car by hand.
        </p>

        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map(l => <ListingCard key={l.id} listing={l} context="hand-wash" />)}
        </div>

        <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#22C55E]" />
            <Link href={`${PATH}/${params.state}`} className="text-[#22C55E] hover:underline font-medium">
              All hand car washes in {stateName} →
            </Link>
          </span>
          <span className="hidden sm:inline text-gray-300">·</span>
          <Link href="/best-hand-wash" className="text-[#22C55E] hover:underline font-medium">
            🏆 Best hand car washes by metro →
          </Link>
        </div>
      </div>
    </main>
  );
}
