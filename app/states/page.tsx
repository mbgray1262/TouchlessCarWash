import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { US_STATES, getStateSlug } from '@/lib/constants';
import type { Metadata } from 'next';

const SITE_URL = 'https://touchlesscarwashfinder.com';

export const metadata: Metadata = {
  title: 'Browse Touchless Car Washes by State — All 51 States | Touchless Car Wash Finder',
  description: 'Browse touchless car wash locations in every US state. Find verified brushless car washes near you with ratings, photos, hours, and directions.',
  alternates: {
    canonical: SITE_URL + '/states',
  },
  openGraph: {
    title: 'Browse Touchless Car Washes by State — All 51 States',
    description: 'Browse touchless car wash locations in every US state. Find verified brushless car washes near you with ratings, photos, hours, and directions.',
    url: SITE_URL + '/states',
    siteName: 'Touchless Car Wash Finder',
    type: 'website',
  },
};

const faqItems = [
  {
    question: 'How many touchless car washes are in the United States?',
    answer: 'Our directory lists over 3,465 verified touchless car wash locations across all 51 states (including Washington D.C.). Every listing has been manually verified to confirm it is a true touchless (brushless) car wash.',
  },
  {
    question: 'Which state has the most touchless car washes?',
    answer: 'Based on our verified listings, California, Texas, and Florida consistently rank among the states with the highest number of touchless car wash locations, reflecting their large populations and warm climates that encourage year-round car washing.',
  },
  {
    question: 'How are these car washes verified?',
    answer: 'Each listing in our directory is verified through a combination of automated website analysis and manual review. We confirm that the facility operates touchless (brushless) equipment — meaning no physical brushes, cloth, or foam pads make contact with your vehicle during the wash cycle.',
  },
  {
    question: 'Can I add my touchless car wash to the directory?',
    answer: 'Yes! If you own or operate a touchless car wash, you can submit your business for free. Visit the Add Your Business page, fill out your location details, and our team will verify and publish your listing.',
  },
];

async function getStateListingCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('state_listing_counts');
  if (error || !data) return {};
  return data as Record<string, number>;
}

export default async function StatesPage() {
  const stateListingCounts = await getStateListingCounts();
  const statesWithListings = US_STATES.filter(s => (stateListingCounts[s.code] ?? 0) > 0);

  const totalListings = Object.values(stateListingCounts).reduce((a, b) => a + b, 0);

  const topThree = statesWithListings
    .slice()
    .sort((a, b) => (stateListingCounts[b.code] ?? 0) - (stateListingCounts[a.code] ?? 0))
    .slice(0, 3);

  const faqWithData = faqItems.map((item, i) => {
    if (i === 1 && topThree.length >= 3) {
      return {
        ...item,
        answer: `Based on our verified listings, ${topThree[0].name} (${stateListingCounts[topThree[0].code]} locations), ${topThree[1].name} (${stateListingCounts[topThree[1].code]} locations), and ${topThree[2].name} (${stateListingCounts[topThree[2].code]} locations) rank as the top three states with the most touchless car wash locations.`,
      };
    }
    return item;
  });

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqWithData.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className="bg-[#0F2744] py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">States</span>
          </nav>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Touchless Car Washes by State
          </h1>
          <p className="text-white/80 text-lg max-w-2xl">
            Browse our complete directory of verified touchless car washes across all 51 US states. Every location has been verified as a true touchless (brushless) car wash. Select your state below to find the nearest touchless car wash.
          </p>
        </div>
      </div>

      <div className="bg-[#0a1f3c] border-t border-white/10">
        <div className="container mx-auto px-4 max-w-6xl py-5">
          <div className="flex flex-wrap gap-6 text-sm text-white/70">
            <span><strong className="text-white text-base">{totalListings.toLocaleString()}+</strong> verified locations</span>
            <span><strong className="text-white text-base">{statesWithListings.length}</strong> states covered</span>
            <span><strong className="text-white text-base">100%</strong> touchless guaranteed</span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-10">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {statesWithListings.map((state) => (
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
                    {stateListingCounts[state.code].toLocaleString()} location{stateListingCounts[state.code] !== 1 ? 's' : ''}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <section className="py-16 bg-[#F0F4F8]">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-muted-foreground">
              Common questions about our touchless car wash directory
            </p>
          </div>
          <div className="divide-y divide-gray-200 border border-gray-200 rounded-2xl overflow-hidden bg-white">
            {faqWithData.map((item, i) => (
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
    </div>
  );
}
