import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight, MapPin } from 'lucide-react';
import { ListingCard } from '@/components/ListingCard';
import { LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { SELF_SERVE_LIVE, publicSelfServeListings, MIN_SELF_SERVE_CITY } from '@/lib/self-serve';
import { US_STATES, getStateName, slugify } from '@/lib/constants';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PATH = '/self-serve-car-wash';

export const revalidate = 3600;

interface Props { params: { state: string } }

function codeFromSlug(stateSlug: string): string | null {
  const s = US_STATES.find(x => slugify(x.name) === stateSlug);
  return s ? s.code : null;
}

// Pre-render all states; those with no public self-serve listings 404 at runtime.
export function generateStaticParams() {
  return US_STATES.map(s => ({ state: slugify(s.name) }));
}

async function getStateListings(code: string): Promise<Listing[]> {
  const { data } = await publicSelfServeListings(LISTING_CARD_COLUMNS)
    .eq('state', code)
    .order('city', { ascending: true })
    .order('name', { ascending: true })
    .limit(1000);
  return (data ?? []) as Listing[];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = codeFromSlug(params.state);
  if (!code) return {};
  const name = getStateName(code);
  const listings = await getStateListings(code);
  const n = listings.length;
  const year = new Date().getFullYear();
  const title = `Self-Service Car Washes in ${name}${n ? ` — ${n} Locations` : ''} | ${year}`;
  const description = `Find self-service (coin-op / wand-bay) car washes in ${name}. ${n} verified locations where you wash your own car — hours, ratings, and directions.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE_URL}${PATH}/${params.state}` },
    robots: SELF_SERVE_LIVE ? undefined : { index: false, follow: false },
    openGraph: { title, description, url: `${SITE_URL}${PATH}/${params.state}`, type: 'website' },
  };
}

export default async function SelfServeStatePage({ params }: Props) {
  const code = codeFromSlug(params.state);
  if (!code) notFound();
  const name = getStateName(code);
  const listings = await getStateListings(code);
  // A state page with no public self-serve listings is thin — 404 it (and it
  // never enters the sitemap). While gated this simply hides empty states from preview.
  if (listings.length === 0) notFound();

  // Group by city for scannable, geo-clustered display.
  const byCity = new Map<string, Listing[]>();
  for (const l of listings) {
    const c = l.city || 'Other';
    if (!byCity.has(c)) byCity.set(c, []);
    byCity.get(c)!.push(l);
  }
  const cities = Array.from(byCity.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

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
          <span className="text-[#0F2744] font-medium">{name}</span>
        </nav>

        <h1 className="text-3xl font-extrabold text-[#0F2744]">Self-Service Car Washes in {name}</h1>
        <p className="mt-2 text-gray-600">
          {listings.length} verified self-service {listings.length === 1 ? 'location' : 'locations'} across {cities.length} {cities.length === 1 ? 'city' : 'cities'} — wash your own car in an open wand bay.
        </p>

        {cities.map(([city, group]) => (
          <section key={city} className="mt-10">
            <h2 className="text-xl font-bold text-[#0F2744] mb-4 flex items-center gap-2">
              <MapPin className="w-4.5 h-4.5 text-[#22C55E]" />
              {group.length >= MIN_SELF_SERVE_CITY
                ? <Link href={`${PATH}/${params.state}/${slugify(city)}`} className="hover:text-[#22C55E] hover:underline">{city}</Link>
                : city}
              <span className="text-sm font-normal text-gray-400">({group.length})</span>
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.map(l => <ListingCard key={l.id} listing={l} context="self-serve" />)}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
