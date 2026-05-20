import Link from 'next/link';
import type { Metadata } from 'next';
import { ShoppingBag, Sparkles, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { ProductCard } from '@/components/ProductCard';
import { ProductGrid } from '@/components/ProductGrid';
import {
  amazonUrl,
  PRODUCTS,
  SHOP_SECTIONS,
  productsByCategory,
  type Product,
} from '@/lib/affiliate-products';

export const dynamic = 'force-dynamic';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PAGE_PATH = '/shop';
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;

const TITLE = 'Touchless Car Wash Products — The Editor-Picked Toolkit';
const DESCRIPTION =
  'Hand-picked touchless car care products: touchless soaps, foam cannons, pressure washers, and no-contact drying tools. Affiliate-funded, editor-tested recommendations.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    siteName: 'Touchless Car Wash Finder',
    type: 'website',
  },
};

function buildItemListJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Touchless Car Care — Editor Picks',
    description: DESCRIPTION,
    url: PAGE_URL,
    numberOfItems: PRODUCTS.length,
    itemListElement: PRODUCTS.map((p: Product, idx: number) => ({
      '@type': 'ListItem',
      position: idx + 1,
      item: {
        '@type': 'Product',
        name: `${p.brand} ${p.name}`,
        brand: { '@type': 'Brand', name: p.brand },
        description: p.positioning,
        url: amazonUrl(p),
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: p.rating,
          bestRating: 5,
          ratingCount: 1,
        },
      },
    })),
  };
}

export default function ShopPage() {
  const jsonLd = buildItemListJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen bg-white">
        {/* Hero */}
        <section className="bg-gradient-to-br from-[#0F2744] to-[#1E3A8A] text-white">
          <div className="container mx-auto px-4 max-w-6xl py-14 md:py-20">
            <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
              <Link href="/" className="hover:text-white transition-colors">
                Home
              </Link>
              <span>/</span>
              <span className="text-white">Shop</span>
            </nav>
            <div className="flex items-center gap-3 mb-4">
              <ShoppingBag className="w-8 h-8 text-[#22C55E]" />
              <h1 className="text-3xl md:text-5xl font-bold leading-tight">
                The Touchless Toolkit
              </h1>
            </div>
            <p className="text-lg text-blue-100 max-w-3xl leading-relaxed">
              Gear we actually recommend for the audience that uses touchless
              car washes — touchless soaps, foam cannons, pressure washers, and
              no-contact drying tools. Curated by editors, not sales reps.
            </p>
            <p className="text-xs text-white/60 italic mt-4 max-w-3xl">
              Affiliate disclosure: TouchlessFind earns from qualifying
              purchases as an Amazon Associate. Links on this page are
              affiliate links — they don't change your price, but a small
              commission helps us keep the directory free.
            </p>
          </div>
        </section>

        {/* Editor's Top Picks */}
        <section className="bg-gray-50 border-b border-gray-200">
          <div className="container mx-auto px-4 max-w-6xl py-12">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-[#22C55E]" />
              <h2 className="text-2xl font-bold text-[#0F2744]">
                Editor's Top Picks
              </h2>
            </div>
            <p className="text-gray-600 mb-6">
              If you only buy four things, start here.
            </p>
            <ProductGrid
              preset="homepage"
              variant="card"
              bg="transparent"
              title=""
              subtitle=""
            />
          </div>
        </section>

        {/* Category nav */}
        <section className="border-b border-gray-200 sticky top-16 bg-white z-30">
          <div className="container mx-auto px-4 max-w-6xl py-4 overflow-x-auto">
            <div className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
              <span className="text-gray-500 mr-2">Jump to:</span>
              {SHOP_SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="text-[#0F2744] hover:text-[#22C55E] px-3 py-1.5 rounded-full border border-gray-200 hover:border-[#22C55E] transition-colors"
                >
                  {s.title}
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Category sections */}
        <div className="container mx-auto px-4 max-w-6xl py-12 space-y-16">
          {SHOP_SECTIONS.map((section) => {
            const products = productsByCategory(...section.categories);
            if (products.length === 0) return null;
            return (
              <section key={section.id} id={section.id} className="scroll-mt-32">
                <h2 className="text-2xl font-bold text-[#0F2744] mb-2">
                  {section.title}
                </h2>
                <p className="text-gray-600 mb-6 max-w-3xl">
                  {section.subtitle}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} variant="card" />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* How we choose */}
        <section className="bg-gray-50 border-t border-gray-200">
          <div className="container mx-auto px-4 max-w-4xl py-14">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-6 h-6 text-[#22C55E]" />
              <h2 className="text-2xl font-bold text-[#0F2744]">
                How We Choose
              </h2>
            </div>
            <p className="text-gray-700 leading-relaxed mb-6">
              Every product on this page is here because it fits our audience —
              people who care about a scratch-free, no-contact wash. Brands
              don't pay to be featured. We don't accept submitted reviews.
              We narrow the list down ourselves and re-evaluate quarterly.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 bg-white rounded-xl border border-gray-200 p-5">
                <CheckCircle2 className="w-5 h-5 text-[#22C55E] mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold text-[#0F2744] mb-1">
                    Touchless-first
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Everything here serves the no-contact philosophy. No
                    sponges, mitts, or buffing pads.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-white rounded-xl border border-gray-200 p-5">
                <CheckCircle2 className="w-5 h-5 text-[#22C55E] mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold text-[#0F2744] mb-1">
                    No pay-to-play
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Brands cannot buy a placement. The catalog is built around
                    what our editors would actually use.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-white rounded-xl border border-gray-200 p-5">
                <CheckCircle2 className="w-5 h-5 text-[#22C55E] mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold text-[#0F2744] mb-1">
                    Real ratings
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Star ratings reflect Amazon customer reviews — not our
                    opinion of the product.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-white rounded-xl border border-gray-200 p-5">
                <CheckCircle2 className="w-5 h-5 text-[#22C55E] mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold text-[#0F2744] mb-1">
                    Refreshed regularly
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Discontinued or downgraded products get swapped out. New
                    standouts get added.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA back to wash finder */}
        <section className="bg-[#0F2744]">
          <div className="container mx-auto px-4 max-w-3xl py-12 text-center">
            <h2 className="text-2xl font-bold text-white mb-3">
              Need a touchless wash near you first?
            </h2>
            <p className="text-blue-100 mb-6">
              Browse {' '}
              4,000+ verified touchless car washes across all 50 states.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Find a Wash &rarr;
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
