import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ShoppingBag, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { ProductCard } from '@/components/ProductCard';
import {
  affiliateUrl,
  PRODUCTS,
  SHOP_SECTIONS,
  productsByCategory,
  type Product,
} from '@/lib/affiliate-products';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

export const dynamic = 'force-dynamic';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PAGE_PATH = '/shop';
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;
const YEAR = new Date().getFullYear();

const TITLE = `Best Touchless Car Wash Products ${YEAR}: Soaps, Foam Cannons & Gear`;
const DESCRIPTION = `Our editors' picks for the best touchless car wash products of ${YEAR} — Swift, Meguiar's, Adam's, Chemical Guys, Sun Joe, MTM Hydro, Optimum and more. 16 tested products across 7 categories with no-contact washing in mind.`;

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
    images: [DEFAULT_OG_IMAGE],
  },
};

// Display titles override the catalog titles so each H2 starts with "Best"
// (high-value SERP keyword pattern) while the underlying SHOP_SECTIONS keys
// stay stable for routing/anchors.
const SECTION_TITLES: Record<string, string> = {
  'touchless-soaps': 'Best Touchless Car Wash Soaps',
  'snow-foam': 'Best Snow Foam & Pre-Rinse',
  'foam-cannons': 'Best Foam Cannons for Touchless Washing',
  'pressure-washers': 'Best Electric Pressure Washers for Car Washing',
  drying: 'Best Touchless Drying & Microfiber',
  protection: 'Best Ceramic & Wax Protection',
  'wheels-interior': 'Best Wheel & Interior Care',
};

// 50-80 word editorial intros with contextual internal links — builds content
// depth and spreads link equity to high-value pages.
const SECTION_INTROS: Record<string, ReactNode> = {
  'touchless-soaps': (
    <>
      Touchless soaps use alkaline chemistry and high-foaming surfactants to
      lift dirt off paint without any brush or mitt contact — the same
      principle commercial{' '}
      <Link href="/" className="text-[#22C55E] hover:underline font-medium">
        touchless car washes
      </Link>{' '}
      use in their bays. If your car has a ceramic coating or you subscribe to
      an{' '}
      <Link
        href="/unlimited-touchless-car-wash"
        className="text-[#22C55E] hover:underline font-medium"
      >
        unlimited plan
      </Link>
      , look for pH-neutral formulas that won't strip protection. Concentrates
      stretch further per ounce.
    </>
  ),
  'snow-foam': (
    <>
      Snow foam goes on dry, clings to vertical panels, and traps grit in
      suspension while it dwells. It's the most important step for a true
      no-contact wash — the foam does the work your sponge would otherwise do.
      Pair with a{' '}
      <Link
        href="#foam-cannons"
        className="text-[#22C55E] hover:underline font-medium"
      >
        foam cannon
      </Link>{' '}
      and{' '}
      <Link
        href="#pressure-washers"
        className="text-[#22C55E] hover:underline font-medium"
      >
        pressure washer
      </Link>{' '}
      for the full effect.
    </>
  ),
  'foam-cannons': (
    <>
      A foam cannon attaches to your pressure washer's quick-connect and mixes
      soap with air to produce the thick clinging foam touchless washing
      depends on. The PF22.2 below is the gold standard for serious DIY
      detailers; the MATCC is the budget entry that still works well. Either
      option turns your driveway into something close to a{' '}
      <Link
        href="/24-hour-touchless-car-wash"
        className="text-[#22C55E] hover:underline font-medium"
      >
        24-hour touchless bay
      </Link>
      .
    </>
  ),
  'pressure-washers': (
    <>
      Electric pressure washers in the 2,000-2,500 PSI range are the sweet
      spot for car washing — enough power to rinse dense foam, gentle enough
      not to risk paint damage. Both models below are safe for ceramic
      coatings and the kind of touchless setup you'd find at major{' '}
      <Link
        href="/chains"
        className="text-[#22C55E] hover:underline font-medium"
      >
        commercial touchless chains
      </Link>
      .
    </>
  ),
  drying: (
    <>
      The drying stage is where contact damage usually creeps in — wiping a
      not-quite-rinsed car drags grit across the clearcoat. Air-blower dryers
      eliminate the risk entirely; premium microfibers are the next-best
      option for areas the blower can't reach. Both pair well with the soaps
      and{' '}
      <Link
        href="#protection"
        className="text-[#22C55E] hover:underline font-medium"
      >
        ceramic protection
      </Link>{' '}
      above.
    </>
  ),
  protection: (
    <>
      A spray-on ceramic topper between washes makes future touchless rinses
      sheet water and shed dirt faster — meaning your{' '}
      <Link
        href="/unlimited-touchless-car-wash"
        className="text-[#22C55E] hover:underline font-medium"
      >
        unlimited plan
      </Link>{' '}
      or weekend driveway session does more in less time. Apply right after
      the wash while the panel is still wet.
    </>
  ),
  'wheels-interior': (
    <>
      Wheels and interior care are where touchless thinking is hardest to
      apply — but spray-and-rinse wheel cleaners (no scrubbing) and quick
      interior wipes (one-handed, glovebox-friendly) keep contact to a
      minimum. Use them between your regular touchless washes to keep brake
      dust and dashboard grime under control.
    </>
  ),
};

function buildItemListJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: TITLE,
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
        url: affiliateUrl(p),
        ...(p.imageUrl ? { image: p.imageUrl } : {}),
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

function buildBreadcrumbJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: SITE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Shop',
        item: PAGE_URL,
      },
    ],
  };
}

export default function ShopPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildItemListJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbJsonLd()) }}
      />

      <div className="min-h-screen bg-white">
        {/* Hero */}
        <section className="bg-gradient-to-br from-[#0F2744] to-[#1E3A8A] text-white">
          <div className="container mx-auto px-4 max-w-6xl py-14 md:py-20">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-sm text-white/50 mb-5"
            >
              <Link href="/" className="hover:text-white transition-colors">
                Home
              </Link>
              <span>/</span>
              <span className="text-white">Shop</span>
            </nav>
            <div className="flex items-center gap-3 mb-2">
              <ShoppingBag className="w-8 h-8 text-[#22C55E]" />
              <h1 className="text-3xl md:text-5xl font-bold leading-tight">
                Best Touchless Car Wash Products
              </h1>
            </div>
            <p className="text-base md:text-lg text-[#22C55E]/90 font-semibold mb-4">
              The Touchless Toolkit — Editor Picks for {YEAR}
            </p>
            <p className="text-lg text-blue-100 max-w-3xl leading-relaxed">
              Hand-picked gear for the audience that uses touchless car washes:
              the best touchless soaps, foam cannons, pressure washers, and
              no-contact drying tools — from Swift, Meguiar's, Adam's, Chemical
              Guys, Sun Joe, MTM Hydro, Optimum and more.
            </p>
            <p className="text-xs text-white/60 italic mt-4 max-w-3xl">
              Affiliate disclosure: TouchlessFind earns from qualifying
              purchases as an Amazon Associate. Links on this page are
              affiliate links — they don't change your price, but a small
              commission helps us keep the directory free.
            </p>
          </div>
        </section>

        {/* Category nav */}
        <section className="border-b border-gray-200 sticky top-16 bg-white z-30 shadow-sm">
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
            const heading = SECTION_TITLES[section.id] ?? section.title;
            const intro = SECTION_INTROS[section.id];
            const gridClass =
              products.length === 1
                ? 'grid grid-cols-1 max-w-sm gap-4'
                : products.length === 2
                  ? 'grid grid-cols-1 sm:grid-cols-2 max-w-3xl gap-4'
                  : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';
            return (
              <section key={section.id} id={section.id} className="scroll-mt-32">
                <h2 className="text-2xl font-bold text-[#0F2744] mb-2">
                  {heading}
                </h2>
                <p className="text-gray-600 mb-3 max-w-3xl">
                  {section.subtitle}
                </p>
                {intro && (
                  <p className="text-sm text-gray-700 leading-relaxed mb-6 max-w-3xl">
                    {intro}
                  </p>
                )}
                <div className={gridClass}>
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
              Browse 4,000+ verified touchless car washes across all 50 states.
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
