import Link from 'next/link';
import { Trophy, ChevronRight } from 'lucide-react';
import { type MetroRegion } from '@/lib/metro-areas';
import { getQualifyingMetros } from '@/lib/metro-queries';
import { BestMetroSearch } from '@/components/BestMetroSearch';
import type { Metadata } from 'next';

// ISR: render on demand, cache the result at the Netlify edge for 1h (then
// serve-stale-while-revalidate via netlify.toml). Unlike force-dynamic — which
// emits `no-store` and made Netlify BYPASS the CDN cache on every request (slow
// TTFB) — ISR lets the durable edge cache store a full-body response. The old
// "304-without-body" bug is prevented by the explicit Netlify-CDN-Cache-Control
// SWR headers in netlify.toml (which DO apply to ISR responses). Admin edits
// purge + pre-warm via /api/revalidate. [CANARY: validating before site-wide rollout]
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Best Touchless & Brushless Car Washes by Metro Area',
  description:
    'Find the best-rated touchless & brushless car washes near you in major US metro areas. Rankings based on Google ratings, customer reviews, and verified touchless confirmation.',
  alternates: {
    canonical: 'https://touchlesscarwashfinder.com/best',
  },
  openGraph: {
    title: 'Best Touchless Car Washes by Metro Area | Touchless Car Wash Finder',
    description:
      'Find the best-rated touchless & brushless car washes near you in major US metro areas. Ranked by ratings, reviews, and touchless verification.',
    url: 'https://touchlesscarwashfinder.com/best',
    type: 'website',
  },
};

const REGION_ORDER: MetroRegion[] = ['West', 'Southwest', 'Midwest', 'Southeast', 'Northeast'];

export default async function BestOfIndexPage() {
  const metros = await getQualifyingMetros();

  // Busiest metros first — the search component groups by region for the default
  // view and shows a flat list while filtering; this order carries into both.
  metros.sort((a, b) => b.listingCount - a.listingCount);

  const totalMetros = metros.length;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://touchlesscarwashfinder.com' },
      { '@type': 'ListItem', position: 2, name: 'Best Of', item: 'https://touchlesscarwashfinder.com/best' },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
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
            Best Touchless & Brushless Car Washes by Metro Area
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
          <BestMetroSearch metros={metros} regionOrder={REGION_ORDER} />
        </div>
      </section>

      {/* Chain rankings promo */}
      <section className="py-12 px-4 bg-gray-50 border-t border-gray-200">
        <div className="container mx-auto max-w-5xl">
          <div className="bg-[#0F2744] rounded-2xl p-8 flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="text-5xl">🏆</div>
            <div className="flex-1">
              <h2 className="text-white font-bold text-2xl mb-2">2026 Chain Rankings</h2>
              <p className="text-blue-200 leading-relaxed">
                Which touchless car wash chains come out on top? See our national Top 10 plus regional awards — Most Locations, Highest Rated, Widest Coverage, and Hidden Gem — across the Midwest, Pacific, Northeast, Southeast, and Mountain/Southwest.
              </p>
            </div>
            <Link
              href="/best/chains"
              className="flex-shrink-0 bg-[#22C55E] hover:bg-[#16A34A] text-white font-bold px-7 py-3 rounded-xl transition-colors whitespace-nowrap"
            >
              View Chain Rankings →
            </Link>
          </div>
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
    </>
  );
}
