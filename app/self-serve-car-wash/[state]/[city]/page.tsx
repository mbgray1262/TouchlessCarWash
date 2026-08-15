import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import type { Metadata } from 'next';
import { ChevronRight, MapPin } from 'lucide-react';
import { ListingCard } from '@/components/ListingCard';
import { LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import {
  SELF_SERVE_LIVE,
  publicSelfServeListings,
  getStateSelfServeForAugment,
  getSelfServeCardsByIds,
} from '@/lib/self-serve';
import { bestNearby, INDEXABLE_MIN_EFFECTIVE, NEARBY_RADIUS_MILES } from '@/lib/nearby-augment';
import { US_STATES, getStateName, slugify } from '@/lib/constants';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PATH = '/self-serve-car-wash';

export const revalidate = 3600;

interface Props { params: { state: string; city: string } }

// In-city listings carry coordinates so they can anchor the nearby scan.
type GeoListing = Listing & { latitude: number | null; longitude: number | null };

function codeFromSlug(stateSlug: string): string | null {
  const s = US_STATES.find(x => slugify(x.name) === stateSlug);
  return s ? s.code : null;
}

// ISR on-demand: the qualifying set is large, so pages render on first request
// and edge-cache. Discovery is driven by the sitemap (qualifyingSelfServeCities),
// which uses the SAME effective-count rule as this page's noindex decision.
export function generateStaticParams() { return []; }

// All public self-serve listings in this state whose city slug matches the URL.
// Resolving by slug (not raw name) matches qualifyingSelfServeCities()'s grouping,
// so the page's count and the sitemap's threshold decision can never disagree.
// Coordinates are selected (LISTING_CARD_COLUMNS omits them) so these rows can
// anchor the nearby scan — the same population the sitemap counts.
async function getCityListings(code: string, citySlug: string): Promise<GeoListing[]> {
  const { data } = await publicSelfServeListings(`${LISTING_CARD_COLUMNS}, latitude, longitude`)
    .eq('state', code)
    .order('name', { ascending: true })
    .limit(2000);
  return ((data ?? []) as GeoListing[]).filter(l => slugify(l.city || '') === citySlug);
}

// Nearby self-serve washes within radius of this city — the self-serve mirror of
// the touchless getNearbyForCity. Padding thin cities makes their page genuinely
// useful (and indexable), exactly like the touchless city pages.
const getNearbyForCity = cache(
  async (code: string, cityName: string, inCity: GeoListing[]): Promise<Array<GeoListing & { _distance: number }>> => {
    const slim = await getStateSelfServeForAugment(code);
    const exclude = new Set(inCity.map(l => l.id));
    const picks = bestNearby(inCity, slim, cityName, exclude);
    if (picks.length === 0) return [];
    const distById = new Map(picks.map(p => [p.id, p._distance]));
    const full = await getSelfServeCardsByIds(picks.map(p => p.id));
    return full
      .map(l => ({ ...l, _distance: distById.get(l.id) ?? 0 }))
      .sort((a, b) => a._distance - b._distance);
  },
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = codeFromSlug(params.state);
  if (!code) return {};
  const listings = await getCityListings(code, params.city);
  if (listings.length === 0) return { title: 'Not Found', robots: { index: false, follow: false } };
  const cityName = listings[0].city || params.city;
  const stateName = getStateName(code);
  const nearby = await getNearbyForCity(code, cityName, listings);
  const effectiveCount = listings.length + nearby.length;
  const thin = effectiveCount < INDEXABLE_MIN_EFFECTIVE;
  const year = new Date().getFullYear();
  const title = `Self-Service Car Washes Near Me in ${cityName}, ${code} — ${effectiveCount} Location${effectiveCount === 1 ? '' : 's'} | ${year}`;
  const description = `Find self-service car washes in or near ${cityName}, ${stateName} — ${effectiveCount} verified DIY, self-wash & coin-op wand bays where you wash your own car. Hours, ratings, and directions.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE_URL}${PATH}/${params.state}/${params.city}` },
    // Mirror the touchless city pages: render (200) but noindex when thin, so
    // "in sitemap ⟺ indexable" holds against qualifyingSelfServeCities().
    robots: (!SELF_SERVE_LIVE || thin) ? { index: false, follow: true } : undefined,
    openGraph: { title, description, url: `${SITE_URL}${PATH}/${params.state}/${params.city}`, type: 'website' },
  };
}

export default async function SelfServeCityPage({ params }: Props) {
  const code = codeFromSlug(params.state);
  if (!code) notFound();
  const listings = await getCityListings(code, params.city);
  // No self-serve bays in this city at all → 404. Cities with >=1 in-city bay
  // render; thin ones (effective < INDEXABLE_MIN_EFFECTIVE) render but noindex,
  // exactly mirroring the touchless city pages.
  if (listings.length === 0) notFound();

  const cityName = listings[0].city || params.city;
  const stateName = getStateName(code);
  const nearby = await getNearbyForCity(code, cityName, listings);

  return (
    <main className="min-h-screen bg-white">
      {!SELF_SERVE_LIVE && (
        <div className="bg-amber-500 text-white text-center text-sm font-semibold py-2 px-4">
          PREVIEW — not live yet (hidden from Google &amp; not linked).
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1.5 flex-wrap">
          <Link href={PATH} className="hover:text-[#22C55E]">Self-Service Car Washes</Link>
          <ChevronRight className="w-4 h-4" />
          <Link href={`${PATH}/${params.state}`} className="hover:text-[#22C55E]">{stateName}</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-[#0F2744] font-medium">{cityName}</span>
        </nav>

        <h1 className="text-3xl font-extrabold text-[#0F2744]">Self-Service Car Washes in or Near {cityName}, {stateName}</h1>
        <p className="mt-2 text-gray-600">
          {listings.length} verified self-service {listings.length === 1 ? 'location' : 'locations'} in {cityName}
          {nearby.length > 0 && <> + {nearby.length} more within {NEARBY_RADIUS_MILES} miles</>} — DIY, self-wash and coin-op wand bays where you wash your own car, on your own time.
        </p>

        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map(l => <ListingCard key={l.id} listing={l} context="self-serve" />)}
        </div>

        {nearby.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold text-[#0F2744] mb-4">Self-service car washes near {cityName}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {nearby.map(l => <ListingCard key={l.id} listing={l} context="self-serve" />)}
            </div>
          </section>
        )}

        <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#22C55E]" />
            <Link href={`${PATH}/${params.state}`} className="text-[#22C55E] hover:underline font-medium">
              All self-service car washes in {stateName} →
            </Link>
          </span>
          <span className="hidden sm:inline text-gray-300">·</span>
          <Link href="/best-self-serve" className="text-[#22C55E] hover:underline font-medium">
            🏆 Best self-service washes by metro →
          </Link>
        </div>
      </div>
    </main>
  );
}
