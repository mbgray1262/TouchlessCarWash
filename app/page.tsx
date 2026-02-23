import Link from 'next/link';
import { Star, MapPin, CheckCircle, TrendingUp, Search, Eye, Sparkles, Droplet } from 'lucide-react';
import HeroSection from '@/components/HeroSection';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListingCard } from '@/components/ListingCard';
import { supabase, type Listing } from '@/lib/supabase';
import { US_STATES, getStateSlug } from '@/lib/constants';
import type { Metadata } from 'next';

const SITE_URL = 'https://touchlesscarwashfinder.com';

const TOP_STATES = ['CA', 'TX', 'FL', 'NY', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI', 'AZ', 'WA'];

export const metadata: Metadata = {
  title: 'Touchless Car Wash Near Me — Find 3,465+ Verified Locations | Touchless Car Wash Finder',
  description: 'Find the nearest touchless car wash in your area. Browse 3,465+ verified brushless car wash locations across all 50 states + DC. No scratches, no brushes — just clean.',
  alternates: {
    canonical: SITE_URL + '/',
  },
  openGraph: {
    title: 'Touchless Car Wash Near Me — Find 3,465+ Verified Locations',
    description: 'Find the nearest touchless car wash in your area. Browse 3,465+ verified brushless car wash locations across all 50 states + DC. No scratches, no brushes — just clean.',
    url: SITE_URL + '/',
    siteName: 'Touchless Car Wash Finder',
    images: [
      {
        url: 'https://res.cloudinary.com/dret3qhyu/image/upload/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png',
        width: 1200,
        height: 630,
        alt: 'Touchless Car Wash Finder',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Touchless Car Wash Near Me — Find 3,465+ Verified Locations',
    description: 'Find the nearest touchless car wash in your area. Browse 3,465+ verified brushless car wash locations across all 50 states + DC.',
    images: ['https://res.cloudinary.com/dret3qhyu/image/upload/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png'],
  },
};

const faqItems = [
  {
    question: 'What is a touchless car wash?',
    answer: 'A touchless car wash uses high-pressure water jets and specialized detergents to clean your vehicle without any physical contact from brushes, cloth, or foam pads. Because nothing touches your car\'s surface, there is zero risk of scratches, swirl marks, or paint damage.',
  },
  {
    question: 'Are touchless car washes better for your car?',
    answer: 'Yes — touchless car washes are widely considered the safest option for your paint. They eliminate brush-induced scratches and swirl marks, preserve ceramic coatings and paint protection film (PPF), and are safe for all paint types including matte finishes. The high-pressure water removes dirt effectively without mechanical abrasion.',
  },
  {
    question: 'How do I find a touchless car wash near me?',
    answer: 'Use the search bar at the top of this page — enter your city, ZIP code, or the name of a car wash and we\'ll show you verified touchless locations nearby. Our directory lists 3,465+ verified touchless car wash locations across all 50 states + DC.',
  },
  {
    question: 'How much does a touchless car wash cost?',
    answer: 'Touchless car wash prices typically range from $8–$20 for a basic wash and $15–$35 for premium packages that include pre-soak, tire shine, and spot-free rinse. Prices vary by location, market, and included services. Monthly unlimited membership plans are also available at many locations, usually priced between $20–$50/month.',
  },
  {
    question: 'Are touchless car washes safe for new cars?',
    answer: 'Touchless car washes are the safest type of car wash for new vehicles. New paint is especially vulnerable to micro-scratches caused by brushes and cloth friction. Touchless washes rely entirely on water pressure and chemistry, making them ideal for new cars, vehicles with ceramic coatings, paint protection film (PPF), or any paint-sensitive finish.',
  },
];

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
  const { data, error } = await supabase.rpc('state_listing_counts');
  if (error || !data) return {};
  return data as Record<string, number>;
}

async function getTotalCount(): Promise<number> {
  const { count, error } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('is_touchless', true);

  return error ? 0 : (count ?? 0);
}

export default async function Home() {
  const [featuredListings, stateListingCounts, totalCount] = await Promise.all([
    getFeaturedListings(),
    getStateListingCounts(),
    getTotalCount(),
  ]);

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Touchless Car Wash Finder',
    url: SITE_URL,
    logo: SITE_URL + '/logo.png',
    description: 'The only directory dedicated exclusively to verified touchless car washes across the United States.',
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  const popularStates = TOP_STATES
    .map((code) => US_STATES.find((s) => s.code === code))
    .filter(Boolean)
    .filter((s) => (stateListingCounts[s!.code] ?? 0) > 0);

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <HeroSection />

      <section className="bg-[#0F2744] py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto text-center">
            <div>
              <div className="text-4xl md:text-5xl font-bold text-white mb-2">{totalCount}+</div>
              <div className="text-sm text-white/80">Verified Listings</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-bold text-white mb-2">50</div>
              <div className="text-sm text-white/80">States + DC Covered</div>
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

      {popularStates.length > 0 && (
        <section className="py-16 bg-[#F0F4F8]">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Popular States
              </h2>
              <p className="text-lg text-muted-foreground">
                Explore touchless car wash directories in the most searched states
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 max-w-6xl mx-auto">
              {popularStates.map((state) => (
                <Link
                  key={state!.code}
                  href={`/state/${getStateSlug(state!.code)}`}
                  className="group"
                >
                  <div className="flex flex-col items-center justify-center bg-white rounded-xl p-5 border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all text-center">
                    <span className="text-2xl font-bold text-[#0F2744] mb-1 group-hover:text-blue-600 transition-colors">
                      {state!.code}
                    </span>
                    <span className="text-sm font-medium text-gray-700 mb-1">{state!.name}</span>
                    <span className="text-xs text-gray-500">
                      {stateListingCounts[state!.code].toLocaleString()} locations
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-16 bg-white">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-muted-foreground">
              Everything you need to know about touchless car washes
            </p>
          </div>
          <div className="divide-y divide-gray-200 border border-gray-200 rounded-2xl overflow-hidden">
            {faqItems.map((item, i) => (
              <details key={i} className="group bg-white">
                <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none select-none hover:bg-gray-50 transition-colors">
                  <span className="text-base font-semibold text-gray-900">{item.question}</span>
                  <span className="flex-shrink-0 w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <div className="px-6 pb-6 pt-1 text-gray-600 leading-relaxed text-sm">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
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
