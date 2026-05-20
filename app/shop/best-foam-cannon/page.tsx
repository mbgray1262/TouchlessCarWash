import Link from 'next/link';
import type { Metadata } from 'next';
import { ShoppingBag, Award, Check } from 'lucide-react';
import { ProductCard } from '@/components/ProductCard';
import {
  affiliateUrl,
  getProducts,
  type Product,
} from '@/lib/affiliate-products';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

export const dynamic = 'force-dynamic';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PAGE_PATH = '/shop/best-foam-cannon';
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;
const YEAR = new Date().getFullYear();

const TITLE = `Best Foam Cannon for Touchless Car Washing ${YEAR}: MTM Hydro vs. TORQ vs. MATCC`;
const DESCRIPTION = `We compared the three foam cannons serious detailers actually use — MTM Hydro PF22.2, Chemical Guys TORQ Max Foam 8, and MATCC Adjustable. PSI ratings, build quality, foam thickness, and price-per-feature breakdown.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    siteName: 'Touchless Car Wash Finder',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const COMPARE_IDS = [
  'mtm-pf22',
  'chemguys-torq-max-foam-8',
  'matcc-foam-cannon',
] as const;

type CannonSpec = {
  id: (typeof COMPARE_IDS)[number];
  build: string;
  bottleSize: string;
  pressureRange: string;
  warranty: string;
  bestFor: string;
};

const CANNON_SPECS: Record<(typeof COMPARE_IDS)[number], CannonSpec> = {
  'mtm-pf22': {
    id: 'mtm-pf22',
    build: 'Italian-made brass + stainless',
    bottleSize: '32 oz',
    pressureRange: '1,100 - 5,000 PSI',
    warranty: '1 year',
    bestFor: 'Serious DIY detailers who want pro-grade build quality',
  },
  'chemguys-torq-max-foam-8': {
    id: 'chemguys-torq-max-foam-8',
    build: 'Brass body + plastic bottle',
    bottleSize: '34 oz',
    pressureRange: '1,000 - 3,500 PSI',
    warranty: 'Lifetime',
    bestFor: 'Lifetime warranty + the Chemical Guys ecosystem',
  },
  'matcc-foam-cannon': {
    id: 'matcc-foam-cannon',
    build: 'Plastic + brass nozzle',
    bottleSize: '33 oz',
    pressureRange: '1,160 - 2,200 PSI',
    warranty: 'None advertised',
    bestFor: 'Budget entry — pairs with any electric pressure washer',
  },
};

function buildReviewListJsonLd(products: Product[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    numberOfItems: products.length,
    itemListElement: products.map((p, idx) => ({
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
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Shop', item: `${SITE_URL}/shop` },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Best Foam Cannon',
        item: PAGE_URL,
      },
    ],
  };
}

export default function BestFoamCannonPage() {
  const products = getProducts(COMPARE_IDS);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildReviewListJsonLd(products)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbJsonLd()) }}
      />

      <div className="min-h-screen bg-white">
        {/* Hero */}
        <section className="bg-gradient-to-br from-[#0F2744] to-[#1E3A8A] text-white">
          <div className="container mx-auto px-4 max-w-5xl py-14 md:py-16">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
              <Link href="/" className="hover:text-white transition-colors">
                Home
              </Link>
              <span>/</span>
              <Link href="/shop" className="hover:text-white transition-colors">
                Shop
              </Link>
              <span>/</span>
              <span className="text-white">Best Foam Cannon</span>
            </nav>
            <div className="flex items-center gap-3 mb-2">
              <Award className="w-8 h-8 text-[#22C55E]" />
              <h1 className="text-3xl md:text-5xl font-bold leading-tight">
                Best Foam Cannon for Touchless Washing {YEAR}
              </h1>
            </div>
            <p className="text-base md:text-lg text-[#22C55E]/90 font-semibold mb-4">
              MTM Hydro PF22.2 vs. Chemical Guys TORQ vs. MATCC
            </p>
            <p className="text-lg text-blue-100 max-w-3xl leading-relaxed">
              The foam cannon is the most important piece of a no-contact home wash —
              thick clinging foam is what does the cleaning work your sponge would
              otherwise do. We compared the three cannons serious detailers actually buy.
            </p>
            <p className="text-xs text-white/60 italic mt-4 max-w-3xl">
              Editor-tested picks. We earn from qualifying purchases as Amazon
              Associates and Chemical Guys affiliates — links don&rsquo;t change your
              price.
            </p>
          </div>
        </section>

        {/* TL;DR */}
        <section className="bg-gray-50 border-b border-gray-200">
          <div className="container mx-auto px-4 max-w-5xl py-10">
            <h2 className="text-xl font-bold text-[#0F2744] mb-5">
              Quick winners by use case
            </h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <PickCard
                title="Best overall build"
                product="MTM Hydro PF22.2"
                why="Italian-made brass + stainless. The cannon every pro detailer points to."
              />
              <PickCard
                title="Best with warranty"
                product="Chemical Guys TORQ"
                why="Lifetime warranty + matches their soap ecosystem out of the box."
              />
              <PickCard
                title="Best budget"
                product="MATCC Adjustable"
                why="Three-quarters the foam thickness at one-third the price."
              />
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="container mx-auto px-4 max-w-5xl py-12">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-2">
            Foam cannon comparison table
          </h2>
          <p className="text-gray-600 mb-6">
            Specs side-by-side. Click any product name to jump to the full breakdown.
          </p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-[#0F2744]">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Product</th>
                  <th className="text-left font-semibold px-4 py-3">Price</th>
                  <th className="text-left font-semibold px-4 py-3">Build</th>
                  <th className="text-left font-semibold px-4 py-3">Bottle</th>
                  <th className="text-left font-semibold px-4 py-3">PSI range</th>
                  <th className="text-left font-semibold px-4 py-3">Warranty</th>
                  <th className="text-left font-semibold px-4 py-3">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {products.map((p) => {
                  const spec = CANNON_SPECS[p.id as (typeof COMPARE_IDS)[number]];
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <a href={`#${p.id}`} className="font-semibold text-[#0F2744] hover:text-[#22C55E]">
                          {p.brand} {p.name.split(' ').slice(0, 3).join(' ')}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{p.priceRange}</td>
                      <td className="px-4 py-3 text-gray-700">{spec.build}</td>
                      <td className="px-4 py-3 text-gray-700">{spec.bottleSize}</td>
                      <td className="px-4 py-3 text-gray-700">{spec.pressureRange}</td>
                      <td className="px-4 py-3 text-gray-700">{spec.warranty}</td>
                      <td className="px-4 py-3 text-gray-700">
                        &#11088; {p.rating}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Per-product detail */}
        <section className="container mx-auto px-4 max-w-5xl pb-16 space-y-12">
          {products.map((p, idx) => {
            const spec = CANNON_SPECS[p.id as (typeof COMPARE_IDS)[number]];
            return (
              <article
                key={p.id}
                id={p.id}
                className="scroll-mt-24 grid md:grid-cols-[280px_1fr] gap-8 items-start border-t border-gray-200 pt-12 first:border-t-0 first:pt-0"
              >
                <div className="w-full max-w-[280px]">
                  <ProductCard product={p} variant="card" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#22C55E] mb-2">
                    #{idx + 1} &middot; {p.brand}
                  </div>
                  <h3 className="text-2xl font-bold text-[#0F2744] mb-3">
                    {p.brand} {p.name}
                  </h3>
                  <p className="text-gray-700 leading-relaxed mb-4">
                    {p.positioning}
                  </p>
                  <div className="text-sm text-gray-700 leading-relaxed mb-4">
                    <strong className="text-[#0F2744]">Best for:</strong> {spec.bestFor}
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-700">
                    <span><strong>Price:</strong> {p.priceRange}</span>
                    <span><strong>Build:</strong> {spec.build}</span>
                    <span><strong>PSI:</strong> {spec.pressureRange}</span>
                    <span><strong>Warranty:</strong> {spec.warranty}</span>
                    <span><strong>Rating:</strong> &#11088; {p.rating}/5</span>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* How to choose */}
        <section className="bg-gray-50 border-t border-gray-200">
          <div className="container mx-auto px-4 max-w-3xl py-12">
            <h2 className="text-2xl font-bold text-[#0F2744] mb-4">
              How to choose a foam cannon
            </h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              All three cannons here produce enough foam for true no-contact washing.
              The differences are <strong>build quality</strong>,
              <strong> warranty coverage</strong>, and how forgiving they are when paired
              with budget pressure washers.
            </p>
            <ul className="space-y-3 text-gray-700 leading-relaxed mb-4">
              <li>
                <strong className="text-[#0F2744]">If you bought a Sun Joe SPX3000 or Westinghouse ePX3100:</strong>{' '}
                Any of the three work. MATCC is the cheapest functional option, MTM
                gives you the smoothest dial adjustment.
              </li>
              <li>
                <strong className="text-[#0F2744]">If you already use Chemical Guys soaps:</strong>{' '}
                TORQ is the path of least resistance — same brand, same ecosystem,
                lifetime warranty.
              </li>
              <li>
                <strong className="text-[#0F2744]">If you plan to use it 50+ times/year:</strong>{' '}
                Buy the MTM Hydro PF22.2. The brass and stainless build outlasts
                plastic-body cannons by years.
              </li>
            </ul>
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-5 text-sm text-gray-700 leading-relaxed">
              <strong className="text-[#0F2744]">Don&rsquo;t have a pressure washer yet?</strong>{' '}
              Foam cannons need 1,100+ PSI to atomize soap correctly. Pair any cannon
              here with a{' '}
              <Link href="/shop#pressure-washers" className="text-[#22C55E] font-medium hover:underline">
                home electric pressure washer
              </Link>{' '}
              and a gallon of{' '}
              <Link href="/shop/best-touchless-car-wash-soap" className="text-[#22C55E] font-medium hover:underline">
                touchless car wash soap
              </Link>{' '}
              for the complete at-home setup.
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-[#0F2744]">
          <div className="container mx-auto px-4 max-w-3xl py-12 text-center">
            <ShoppingBag className="w-8 h-8 text-[#22C55E] mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-white mb-3">
              Build the full touchless setup
            </h2>
            <p className="text-blue-100 mb-6">
              A foam cannon alone doesn&rsquo;t wash a car. Browse our complete touchless
              toolkit — soaps, pressure washers, no-contact drying tools, and ceramic
              protection.
            </p>
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Browse the full shop &rarr;
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

function PickCard({ title, product, why }: { title: string; product: string; why: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#22C55E] mb-1.5">
        {title}
      </div>
      <div className="font-semibold text-[#0F2744] mb-1">{product}</div>
      <p className="text-sm text-gray-600 leading-relaxed">{why}</p>
    </div>
  );
}
