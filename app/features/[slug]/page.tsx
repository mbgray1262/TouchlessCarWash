import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { getStateName, getStateSlug } from '@/lib/constants';
import { FEATURES, getFeatureBySlug } from '@/lib/features';
import type { Metadata } from 'next';

export const revalidate = 86400; // 24 hours

const SITE_URL = 'https://touchlesscarwashfinder.com';

interface FeatureHubPageProps {
  params: { slug: string };
}

export async function generateStaticParams() {
  return FEATURES.map((f) => ({ slug: f.slug }));
}

async function getStateCounts(filterSlug: string): Promise<{ state: string; count: number }[]> {
  const { data } = await supabase.rpc('feature_state_counts', { p_filter_slug: filterSlug });
  return (data as { state: string; count: number }[]) ?? [];
}

async function getTotalCount(filterSlug: string): Promise<number> {
  const { data } = await supabase.rpc('feature_total_count', { p_filter_slug: filterSlug });
  return typeof data === 'number' ? data : 0;
}

export async function generateMetadata({ params }: FeatureHubPageProps): Promise<Metadata> {
  const feature = getFeatureBySlug(params.slug);
  if (!feature) return { title: 'Feature Not Found' };

  return {
    title: feature.seoTitle,
    description: feature.seoDescription,
    alternates: { canonical: `${SITE_URL}/features/${feature.slug}` },
    openGraph: {
      title: `${feature.seoTitle} | Touchless Car Wash Finder`,
      description: feature.seoDescription,
      url: `${SITE_URL}/features/${feature.slug}`,
      siteName: 'Touchless Car Wash Finder',
      type: 'website',
    },
  };
}

export default async function FeatureHubPage({ params }: FeatureHubPageProps) {
  const feature = getFeatureBySlug(params.slug);
  if (!feature) notFound();

  const [stateCounts, totalCount] = await Promise.all([
    getStateCounts(feature.slug),
    getTotalCount(feature.slug),
  ]);

  if (totalCount === 0) notFound();

  // Sort states by count descending
  const sortedStates = [...stateCounts].sort((a, b) => b.count - a.count);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Features', item: `${SITE_URL}/features` },
      { '@type': 'ListItem', position: 3, name: feature.name, item: `${SITE_URL}/features/${feature.slug}` },
    ],
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: feature.faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: typeof item.answer === 'function' ? item.answer('the United States', totalCount) : item.answer,
      },
    })),
  };

  const otherFeatures = FEATURES.filter((f) => f.slug !== feature.slug);

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="bg-[#0F2744] py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/features" className="hover:text-white transition-colors">Features</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">{feature.name}</span>
          </nav>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            {feature.seoTitle}
          </h1>
          <p className="text-white/70 text-lg">
            {totalCount.toLocaleString()} verified locations across {sortedStates.length} states
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto pt-8">

          <div className="mb-8 p-5 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-gray-700 text-base leading-relaxed">
              {feature.longDescription}
            </p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">Browse by State</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {sortedStates.map((s) => {
                const stateName = getStateName(s.state);
                const stateSlug = getStateSlug(s.state);
                return (
                  <Link key={s.state} href={`/features/${feature.slug}/${stateSlug}`}>
                    <Card className="hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-[#0F2744]">{stateName}</div>
                            <div className="text-sm text-muted-foreground">
                              {s.count} location{s.count !== 1 ? 's' : ''}
                            </div>
                          </div>
                          <span className="text-2xl font-bold text-[#0F2744] opacity-30">{s.state}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>

          <section className="mt-14 pt-10 border-t border-gray-200">
            <h2 className="text-2xl font-bold text-foreground mb-6">
              Frequently Asked Questions
            </h2>
            <div className="divide-y divide-gray-200 border border-gray-200 rounded-2xl overflow-hidden bg-white">
              {feature.faqItems.map((item, i) => (
                <details key={i} className="group bg-white">
                  <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none select-none hover:bg-gray-50 transition-colors">
                    <span className="text-base font-semibold text-gray-900">{item.question}</span>
                    <span className="flex-shrink-0 w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                  </summary>
                  <div className="px-6 pb-6 pt-1 text-gray-600 leading-relaxed text-sm">
                    {typeof item.answer === 'function'
                      ? item.answer('the United States', totalCount)
                      : item.answer}
                  </div>
                </details>
              ))}
            </div>
          </section>

          {otherFeatures.length > 0 && (
            <div className="mt-14 pt-10 border-t border-gray-200">
              <h2 className="text-xl font-bold text-foreground mb-4">Explore Other Features</h2>
              <div className="flex flex-wrap gap-2">
                {otherFeatures.map((f) => (
                  <Link
                    key={f.slug}
                    href={`/features/${f.slug}`}
                    className="inline-flex items-center px-4 py-2 rounded-full bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-sm font-medium text-gray-700 transition-colors border border-gray-200 hover:border-blue-200"
                  >
                    {f.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
