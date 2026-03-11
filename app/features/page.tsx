import Link from 'next/link';
import { ChevronRight, Wind, Clock, Hand, CreditCard, RefreshCw, Car } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { FEATURES } from '@/lib/features';
import type { Metadata } from 'next';

export const revalidate = 86400; // 24 hours

const SITE_URL = 'https://touchlesscarwashfinder.com';

const ICON_MAP: Record<string, React.ReactNode> = {
  wind: <Wind className="w-6 h-6" />,
  clock: <Clock className="w-6 h-6" />,
  hand: <Hand className="w-6 h-6" />,
  'id-card': <CreditCard className="w-6 h-6" />,
  'refresh-cw': <RefreshCw className="w-6 h-6" />,
  car: <Car className="w-6 h-6" />,
};

export const metadata: Metadata = {
  title: 'Touchless Car Wash Features & Amenities',
  description:
    'Browse touchless car washes by feature — free vacuums, 24-hour access, membership programs, unlimited wash clubs, and more. Filter across all 50 states.',
  alternates: { canonical: `${SITE_URL}/features` },
  openGraph: {
    title: 'Touchless Car Wash Features & Amenities | Touchless Car Wash Finder',
    description:
      'Browse touchless car washes by feature — free vacuums, 24-hour access, membership programs, unlimited wash clubs, and more.',
    url: `${SITE_URL}/features`,
    siteName: 'Touchless Car Wash Finder',
    type: 'website',
  },
};

async function getFeatureCounts(): Promise<Record<string, number>> {
  const results = await Promise.all(
    FEATURES.map((f) => supabase.rpc('feature_total_count', { p_filter_slug: f.slug }))
  );
  const counts: Record<string, number> = {};
  FEATURES.forEach((f, i) => {
    counts[f.slug] = typeof results[i].data === 'number' ? results[i].data : 0;
  });
  return counts;
}

export default async function FeaturesIndexPage() {
  const featureCounts = await getFeatureCounts();

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Features', item: `${SITE_URL}/features` },
    ],
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="bg-[#0F2744] py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">Features</span>
          </nav>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Touchless Car Wash Features & Amenities
          </h1>
          <p className="text-white/70 text-lg">
            Browse verified touchless car washes by the features that matter most to you.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto pt-8">
          <div className="mb-8 p-5 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-gray-700 text-base leading-relaxed">
              Not all touchless car washes are the same. Some offer free vacuums, 24-hour access, unlimited
              wash memberships, or undercarriage cleaning. Use the feature pages below to find exactly what
              you&apos;re looking for in your area.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {FEATURES.map((feature) => {
              const count = featureCounts[feature.slug] ?? 0;
              if (count === 0) return null;
              return (
                <Link key={feature.slug} href={`/features/${feature.slug}`}>
                  <Card className="hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer h-full">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          {ICON_MAP[feature.icon] ?? <Wind className="w-6 h-6" />}
                        </div>
                        <h2 className="text-lg font-bold text-[#0F2744]">{feature.name}</h2>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{feature.shortDescription}</p>
                      <p className="text-sm font-medium text-blue-600">
                        {count.toLocaleString()} locations nationwide &rarr;
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          <section className="mt-14 pt-10 border-t border-gray-200">
            <h2 className="text-2xl font-bold text-foreground mb-6">
              Frequently Asked Questions
            </h2>
            <div className="divide-y divide-gray-200 border border-gray-200 rounded-2xl overflow-hidden bg-white">
              <details className="group bg-white">
                <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none select-none hover:bg-gray-50 transition-colors">
                  <span className="text-base font-semibold text-gray-900">What features can I filter by?</span>
                  <span className="flex-shrink-0 w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <div className="px-6 pb-6 pt-1 text-gray-600 leading-relaxed text-sm">
                  You can filter touchless car washes by free vacuum stations, 24-hour availability, membership programs, unlimited wash clubs, and undercarriage cleaning. Each feature page shows all states with qualifying locations.
                </div>
              </details>
              <details className="group bg-white">
                <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none select-none hover:bg-gray-50 transition-colors">
                  <span className="text-base font-semibold text-gray-900">How do you verify which features a car wash offers?</span>
                  <span className="flex-shrink-0 w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <div className="px-6 pb-6 pt-1 text-gray-600 leading-relaxed text-sm">
                  Feature data is gathered from Google Business profiles, business websites, and customer reviews. We cross-reference multiple sources to confirm accuracy. If you notice incorrect feature data on a listing, please let us know.
                </div>
              </details>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
