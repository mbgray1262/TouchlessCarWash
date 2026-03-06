import Link from 'next/link';
import { Trophy, MapPin, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { METRO_AREAS, boundingBox, haversineDistance, getMetrosByRegion, type MetroArea, type MetroRegion } from '@/lib/metro-areas';
import type { Metadata } from 'next';

// Revalidate every 24 hours — pre-rendered but refreshes daily for new metros/counts
export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Best Touchless Car Washes by Metro Area | Touchless Car Wash Finder',
  description:
    'Find the best-rated touchless car washes in major US metro areas. Rankings based on Google ratings, customer reviews, and verified touchless confirmation.',
  alternates: {
    canonical: 'https://touchlesscarwashfinder.com/best',
  },
  openGraph: {
    title: 'Best Touchless Car Washes by Metro Area',
    description:
      'Find the best-rated touchless car washes in major US metro areas. Ranked by ratings, reviews, and touchless verification.',
    url: 'https://touchlesscarwashfinder.com/best',
    type: 'website',
  },
};

type MetroWithCount = MetroArea & { listingCount: number };

async function getQualifyingMetros(): Promise<MetroWithCount[]> {
  // Fetch ALL touchless listings with coordinates — must paginate since Supabase caps at 1000 rows per request
  const PAGE_SIZE = 1000;
  const allListings: { latitude: number; longitude: number }[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('listings')
      .select('latitude, longitude')
      .eq('is_touchless', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error || !data || data.length === 0) break;
    allListings.push(...(data as { latitude: number; longitude: number }[]));
    if (data.length < PAGE_SIZE) break; // Last page
    offset += PAGE_SIZE;
  }

  const listings = allListings;

  // For each metro, count listings within radius
  const results: MetroWithCount[] = [];

  for (const metro of METRO_AREAS) {
    const box = boundingBox(metro.lat, metro.lng, metro.radiusMiles);

    // Fast bounding-box pre-filter, then haversine
    let count = 0;
    for (const listing of listings) {
      if (
        listing.latitude >= box.minLat &&
        listing.latitude <= box.maxLat &&
        listing.longitude >= box.minLng &&
        listing.longitude <= box.maxLng
      ) {
        const dist = haversineDistance(metro.lat, metro.lng, listing.latitude, listing.longitude);
        if (dist <= metro.radiusMiles) count++;
      }
    }

    if (count >= 5) {
      results.push({ ...metro, listingCount: count });
    }
  }

  return results;
}

const REGION_ORDER: MetroRegion[] = ['West', 'Southwest', 'Midwest', 'Southeast', 'Northeast'];

export default async function BestOfIndexPage() {
  const metros = await getQualifyingMetros();

  // Group by region
  const byRegion = new Map<MetroRegion, MetroWithCount[]>();
  for (const region of REGION_ORDER) {
    byRegion.set(region, []);
  }
  for (const metro of metros) {
    byRegion.get(metro.region)?.push(metro);
  }
  // Sort each region by listing count
  REGION_ORDER.forEach((region) => {
    byRegion.get(region)?.sort((a, b) => b.listingCount - a.listingCount);
  });

  const totalMetros = metros.length;

  return (
    <main>
      {/* Hero */}
      <section className="bg-[#0F2744] text-white py-16 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <p className="text-[#22C55E] text-sm font-semibold uppercase tracking-widest">
              Best Of
            </p>
            <Trophy className="w-5 h-5 text-yellow-400" />
          </div>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">
            Best Touchless Car Washes by Metro Area
          </h1>
          <p className="text-lg text-blue-100 leading-relaxed max-w-2xl mx-auto">
            Explore the top-rated touchless car washes in {totalMetros} major metro areas across the US.
            Every listing is verified brushless — ranked by ratings, reviews, and touchless confirmation.
          </p>
        </div>
      </section>

      {/* Breadcrumb */}
      <div className="bg-gray-50 border-b border-gray-200 py-3 px-4">
        <div className="container mx-auto max-w-5xl">
          <nav className="flex items-center gap-1.5 text-sm text-gray-500">
            <Link href="/" className="hover:text-[#22C55E]">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-gray-900 font-medium">Best Of</span>
          </nav>
        </div>
      </div>

      {/* Metro cards by region */}
      <section className="py-12 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          {REGION_ORDER.map((region) => {
            const regionMetros = byRegion.get(region) ?? [];
            if (regionMetros.length === 0) return null;

            return (
              <div key={region} className="mb-12 last:mb-0">
                <h2 className="text-2xl font-bold text-[#0F2744] mb-6 pb-2 border-b border-gray-200">
                  {region}
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {regionMetros.map((metro) => (
                    <Link
                      key={metro.slug}
                      href={`/best/${metro.slug}`}
                      className="group bg-white rounded-xl p-6 border border-gray-200 hover:border-[#22C55E] hover:shadow-lg transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-[#0F2744] group-hover:text-[#22C55E] transition-colors">
                            {metro.name}
                          </h3>
                          <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{metro.displayName}</span>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-[#22C55E] transition-colors shrink-0" />
                      </div>
                      <div className="mt-3 text-sm">
                        <span className="font-semibold text-[#0F2744]">{metro.listingCount}</span>
                        <span className="text-gray-500"> touchless car washes</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-[#0F2744]">
        <div className="container mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Own a Touchless Car Wash?
          </h2>
          <p className="text-blue-200 mb-6">
            Get listed for free and appear in our metro area rankings. Reach thousands of car owners
            searching for a verified touchless wash near them.
          </p>
          <Link
            href="/add-listing"
            className="inline-block bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-8 py-3 rounded-lg transition-colors"
          >
            Get Listed for Free
          </Link>
        </div>
      </section>
    </main>
  );
}
