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

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const stateCode = getStateCode(params.state);
  if (!stateCode) return { title: 'Not Found' };
  const cityName = unslugCity(params.city);
  const stateName = getStateName(stateCode);
  return {
    title: `Touchless Car Washes in ${cityName}, ${stateCode} | ${cityName} Car Wash Directory`,
    description: `Find the best touchless car washes in ${cityName}, ${stateName}. Browse verified listings with hours, amenities, and directions.`,
  };
}

export default async function CityPage({ params }: CityPageProps) {
  const stateCode = getStateCode(params.state);
  if (!stateCode) notFound();

  const stateName = getStateName(stateCode!);
  const cityName = unslugCity(params.city);
  const listings = await getCityListings(stateCode!, params.city);

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

  return (
    <div className="min-h-screen">
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
      </div>
    </div>
  );
}
