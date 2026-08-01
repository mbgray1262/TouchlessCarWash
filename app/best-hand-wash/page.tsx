import Link from 'next/link';
import { Droplets, ChevronRight, MapPin } from 'lucide-react';
import { getQualifyingHandWashMetros } from '@/lib/hand-wash-metro';
import { HAND_WASH_LIVE } from '@/lib/hand-wash';
import type { Metadata } from 'next';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Best Hand Car Washes by Metro Area',
  description:
    'Find the best-rated hand car washes near you across major US metro areas — full-service hand washing and detailing where attendants wash your car by hand. Ranked by customer reviews and hand-wash satisfaction.',
  alternates: { canonical: 'https://touchlesscarwashfinder.com/best-hand-wash' },
  // Keep the whole hand-wash section out of the index until the category is live.
  robots: HAND_WASH_LIVE ? undefined : { index: false, follow: false },
  openGraph: {
    title: 'Best Hand Car Washes by Metro Area | Touchless Car Wash Finder',
    description: 'The top-rated hand car washes near you in major US metro areas.',
    url: 'https://touchlesscarwashfinder.com/best-hand-wash',
    type: 'website',
  },
};

export default async function BestHandWashIndexPage() {
  const metros = await getQualifyingHandWashMetros();
  metros.sort((a, b) => b.listingCount - a.listingCount);
  const total = metros.length;

  const breadcrumbSchema = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://touchlesscarwashfinder.com' },
      { '@type': 'ListItem', position: 2, name: 'Best Hand Wash', item: 'https://touchlesscarwashfinder.com/best-hand-wash' },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <main>
        {!HAND_WASH_LIVE && (
          <div className="bg-amber-500 text-white text-center text-sm font-semibold py-2 px-4">
            PREVIEW — not live yet (hidden from Google &amp; not linked).
          </div>
        )}
        <section className="bg-[#0F2744] text-white py-16 px-4">
          <div className="container mx-auto max-w-4xl text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Droplets className="w-5 h-5 text-[#22C55E]" />
              <p className="text-[#22C55E] text-sm font-semibold uppercase tracking-widest">Best Of · Hand Wash</p>
              <Droplets className="w-5 h-5 text-[#22C55E]" />
            </div>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">Best Hand Car Washes by Metro Area</h1>
            <p className="text-lg text-blue-100 leading-relaxed max-w-2xl mx-auto">
              Explore the top-rated hand car washes across {total} US metro areas — full-service hand washing and detailing ranked by real customer reviews and hand-wash satisfaction.
            </p>
          </div>
        </section>

        <div className="bg-gray-50 border-b border-gray-200 py-3 px-4">
          <div className="container mx-auto max-w-5xl">
            <nav className="flex items-center gap-1.5 text-sm text-gray-500">
              <Link href="/" className="hover:text-[#22C55E]">Home</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-gray-900 font-medium">Best Hand Wash</span>
            </nav>
          </div>
        </div>

        <section className="py-12 px-4 bg-white">
          <div className="container mx-auto max-w-5xl">
            {total === 0 ? (
              <p className="text-center text-gray-500">Hand-wash rankings are being compiled — check back soon.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {metros.map((m) => (
                  <Link key={m.slug} href={`/best-hand-wash/${m.slug}`}
                    className="group flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-[#22C55E] hover:shadow-sm transition-all">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <MapPin className="w-4 h-4 text-[#22C55E] shrink-0" />
                      <span className="font-semibold text-[#0F2744] truncate">{m.name}</span>
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">{m.listingCount} washes</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-8 text-center">
              <Link href="/hand-car-wash" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#22C55E] hover:underline">
                <MapPin className="w-4 h-4" /> Browse all hand car washes by state →
              </Link>
            </div>
          </div>
        </section>

        <section className="py-12 px-4 bg-gray-50 border-t border-gray-200">
          <div className="container mx-auto max-w-5xl">
            <div className="bg-[#0F2744] rounded-2xl p-8 flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="text-5xl">✨</div>
              <div className="flex-1">
                <h2 className="text-white font-bold text-2xl mb-2">Prefer a touchless, brushless wash?</h2>
                <p className="text-blue-200 leading-relaxed">See our metro rankings for automatic touchless car washes — no brushes ever touch your paint.</p>
              </div>
              <Link href="/best" className="flex-shrink-0 bg-[#22C55E] hover:bg-[#16A34A] text-white font-bold px-7 py-3 rounded-xl transition-colors whitespace-nowrap">
                Best Touchless →
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
