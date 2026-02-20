import Link from 'next/link';
import { Star, MapPin, CheckCircle, TrendingUp, Search, Eye, Sparkles, Droplet } from 'lucide-react';
import { SearchBar } from '@/components/SearchBar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListingCard } from '@/components/ListingCard';
import { supabase, type Listing } from '@/lib/supabase';
import { US_STATES, getStateSlug } from '@/lib/constants';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Touchless Car Wash Near Me | Find Touchless Car Washes Nationwide',
  description: 'Find the best touchless car washes near you. Search by city or zip code to discover quality touchless car wash services across the United States. Compare prices, read reviews, and get directions.',
};

async function getFeaturedListings(): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('is_touchless', true)
    .eq('is_featured', true)
    .order('rating', { ascending: false })
    .limit(6);

  if (error) {
    console.error('Error fetching featured listings:', error);
    return [];
  }

  return data || [];
}

async function getStateListingCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('listings')
    .select('state')
    .eq('is_touchless', true);

  if (error || !data) return {};

  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.state] = (counts[row.state] || 0) + 1;
  }
  return counts;
}

async function getTotalCount(): Promise<number> {
  const { count, error } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('is_touchless', true);

  return error ? 0 : (count ?? 0);
}

export default async function Home() {
  const [featuredListings, stateListingCounts, totalCount] = await Promise.race([
    Promise.all([getFeaturedListings(), getStateListingCounts(), getTotalCount()]),
    new Promise<[[], Record<string, number>, number]>((resolve) =>
      setTimeout(() => resolve([[], {}, 0]), 5000)
    ),
  ]);

  return (
    <div className="min-h-screen">
      <section
        id="search"
        className="relative min-h-[70vh] md:min-h-[80vh] flex items-center"
        style={{
          backgroundImage: 'url(https://res.cloudinary.com/dret3qhyu/image/upload/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        <div
          className="absolute inset-0 bg-gradient-to-r from-[#0a1628]/95 via-[#0a1628]/75 via-40% to-transparent"
          aria-hidden="true"
        />

        <div className="container mx-auto px-4 md:px-8 relative z-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Search className="w-4 h-4" />
              100% Touchless Only
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
              Find Touchless Car Washes Near You
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
              The only directory dedicated exclusively to touchless car washes. No brushes, no scratches — just clean.
            </p>
            <div className="mb-6">
              <SearchBar placeholder="Search by city or ZIP" />
            </div>
            <p className="text-sm text-white/70">
              Verified listings • Real reviews • Updated regularly
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#0F2744] py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto text-center">
            <div>
              <div className="text-4xl md:text-5xl font-bold text-white mb-2">{totalCount}+</div>
              <div className="text-sm text-white/80">Verified Listings</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-bold text-white mb-2">{Object.keys(stateListingCounts).length}</div>
              <div className="text-sm text-white/80">States Covered</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-bold text-white mb-2">100%</div>
              <div className="text-sm text-white/80">Touchless Guaranteed</div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-[#F0F4F8]">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Finding a quality touchless car wash has never been easier
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="text-center border-2 hover:border-blue-500 transition-colors border-t-4 border-t-blue-500">
              <CardHeader>
                <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-8 h-8 text-white" />
                </div>
                <CardTitle className="text-xl">1. Search Your Area</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Enter your city or zip code to find touchless car washes nearby
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center border-2 hover:border-green-500 transition-colors border-t-4 border-t-green-500">
              <CardHeader>
                <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-4">
                  <Eye className="w-8 h-8 text-white" />
                </div>
                <CardTitle className="text-xl">2. Compare Options</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  View pricing, amenities, and read verified customer reviews
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center border-2 hover:border-orange-500 transition-colors border-t-4 border-t-orange-500">
              <CardHeader>
                <div className="w-16 h-16 rounded-full bg-orange-500 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <CardTitle className="text-xl">3. Visit & Review</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Get directions and visit your chosen car wash, then leave a review
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {featuredListings.length > 0 && (
        <section className="py-16 bg-card">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Featured Touchless Car Washes
              </h2>
              <p className="text-lg text-muted-foreground">
                Top-rated locations handpicked by our team
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {featuredListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  showVerifiedBadge
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="browse-states" className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Browse by State
            </h2>
            <p className="text-lg text-muted-foreground">
              Find touchless car washes in your state
            </p>
          </div>

          {Object.keys(stateListingCounts).length === 0 ? (
            <p className="text-center text-muted-foreground">No states with listings yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-w-6xl mx-auto">
              {US_STATES.filter((state) => (stateListingCounts[state.code] ?? 0) > 0).map((state) => (
                <Link
                  key={state.code}
                  href={`/state/${getStateSlug(state.code)}`}
                  className="group"
                >
                  <Card className="text-center hover:shadow-lg transition-all cursor-pointer hover:bg-gradient-to-br hover:from-blue-50 hover:to-blue-100">
                    <CardContent className="p-6">
                      <div className="text-4xl font-bold text-[#0F2744] mb-2 group-hover:scale-110 transition-transform">
                        {state.code}
                      </div>
                      <div className="text-sm font-medium text-foreground mb-1">
                        {state.name}
                      </div>
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        {stateListingCounts[state.code]} wash{stateListingCounts[state.code] !== 1 ? 'es' : ''}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-16 bg-gradient-to-r from-[#0F2744] to-[#1E3A8A]">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 max-w-6xl mx-auto">
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                Own a Touchless Car Wash?
              </h2>
              <p className="text-lg text-white/90 mb-8">
                List your business for free and connect with thousands of potential
                customers searching for touchless car wash services in your area.
              </p>
              <Button asChild size="lg" className="text-lg px-8 h-14 bg-[#22C55E] hover:bg-[#16A34A] text-white">
                <Link href="/add-listing">Add Your Listing Free</Link>
              </Button>
            </div>
            <div className="flex-1 hidden md:flex justify-center">
              <div className="relative w-64 h-64">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/20 to-green-400/20 rounded-full blur-2xl"></div>
                <div className="relative flex items-center justify-center w-full h-full">
                  <Droplet className="w-32 h-32 text-[#22C55E]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
