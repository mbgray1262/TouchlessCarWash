import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase, type Listing } from '@/lib/supabase';
import { US_STATES, getStateName, slugify } from '@/lib/constants';
import { ListingCard } from '@/components/ListingCard';
import type { Metadata } from 'next';

interface StatePageProps {
  params: {
    state: string;
  };
}

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

  return {
    title: `Touchless Car Washes in ${stateName} | ${stateName} Car Wash Directory`,
    description: `Find the best touchless car washes in ${stateName}. Browse verified listings, compare prices, read reviews, and get directions to quality car wash services throughout ${stateName}.`,
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

export default async function StatePage({ params }: StatePageProps) {
  const stateCode = getStateCode(params.state);

  if (!stateCode) {
    notFound();
  }

  const stateName = getStateName(stateCode);
  const listings = await getStateListings(stateCode);

  if (listings.length === 0) {
    return (
      <div className="min-h-screen">
        <div className="bg-[#0F2744] py-10">
          <div className="container mx-auto px-4 max-w-6xl">
            <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
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

  return (
    <div className="min-h-screen">
      <div className="bg-[#0F2744] py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
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
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">Browse by City</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {cities.map((city) => {
                const cityListings = listings.filter(l => l.city === city);
                return (
                  <Link
                    key={city}
                    href={`/car-washes/${params.state}/${city.toLowerCase().replace(/\s+/g, '-')}`}
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
                  href={`/car-washes/${params.state}/${listing.city.toLowerCase().replace(/\s+/g, '-')}/${listing.slug}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
