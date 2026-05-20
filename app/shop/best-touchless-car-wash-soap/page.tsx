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
const PAGE_PATH = '/shop/best-touchless-car-wash-soap';
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;
const YEAR = new Date().getFullYear();

const TITLE = `Best Touchless Car Wash Soap ${YEAR}: Swift vs. Mr. Pink vs. Optimum vs. Meguiar's vs. Adam's`;
const DESCRIPTION = `We compared 5 of the most popular touchless car wash soaps — Swift Touchless, Chemical Guys Mr. Pink, Optimum Touchless Decon, Meguiar's Hyper-Wash, and Adam's. Real prices, pH info, and best-fit guidance for ceramic coatings.`;

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
  'swift-touchless-shampoo',
  'chemguys-mr-pink-super-suds',
  'optimum-touchless-decon',
  'meguiars-hyperwash',
  'adams-car-shampoo',
] as const;

type SoapSpec = {
  id: (typeof COMPARE_IDS)[number];
  size: string;
  ph: string;
  ceramicSafe: boolean;
  foamCannonOK: boolean;
  bestFor: string;
};

const SOAP_SPECS: Record<(typeof COMPARE_IDS)[number], SoapSpec> = {
  'swift-touchless-shampoo': {
    id: 'swift-touchless-shampoo',
    size: '1 gallon',
    ph: 'Heavy alkaline',
    ceramicSafe: false,
    foamCannonOK: true,
    bestFor: 'Daily-driver pickups & SUVs with heavy road grime',
  },
  'chemguys-mr-pink-super-suds': {
    id: 'chemguys-mr-pink-super-suds',
    size: '1 gallon',
    ph: 'pH-balanced',
    ceramicSafe: true,
    foamCannonOK: true,
    bestFor: 'Foam-cannon enthusiasts who want maximum suds',
  },
  'optimum-touchless-decon': {
    id: 'optimum-touchless-decon',
    size: '32 oz',
    ph: 'pH-neutral',
    ceramicSafe: true,
    foamCannonOK: true,
    bestFor: 'Ceramic-coated and PPF-protected vehicles',
  },
  'meguiars-hyperwash': {
    id: 'meguiars-hyperwash',
    size: '1 gallon',
    ph: 'pH-neutral',
    ceramicSafe: true,
    foamCannonOK: true,
    bestFor: 'Body-shop budget — commercial-grade at home',
  },
  'adams-car-shampoo': {
    id: 'adams-car-shampoo',
    size: '16 oz',
    ph: 'pH-balanced',
    ceramicSafe: true,
    foamCannonOK: false,
    bestFor: 'Quick weekend washes with a bucket',
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
        name: 'Best Touchless Car Wash Soap',
        item: PAGE_URL,
      },
    ],
  };
}

export default function BestTouchlessSoapPage() {
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
              <span className="text-white">Best Touchless Soap</span>
            </nav>
            <div className="flex items-center gap-3 mb-2">
              <Award className="w-8 h-8 text-[#22C55E]" />
              <h1 className="text-3xl md:text-5xl font-bold leading-tight">
                Best Touchless Car Wash Soap {YEAR}
              </h1>
            </div>
            <p className="text-base md:text-lg text-[#22C55E]/90 font-semibold mb-4">
              Swift vs. Mr. Pink vs. Optimum vs. Meguiar&rsquo;s vs. Adam&rsquo;s
            </p>
            <p className="text-lg text-blue-100 max-w-3xl leading-relaxed">
              We compared the five most popular touchless car wash soaps for at-home
              no-contact washing. Real prices, pH info, ceramic-coating compatibility,
              and a clear winner for each kind of buyer.
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
            <div className="grid sm:grid-cols-2 gap-4">
              <PickCard
                title="Best for ceramic coatings"
                product="Optimum Touchless Decon"
                why="pH-neutral, won't strip SiO2 protection, ceramic-safe."
              />
              <PickCard
                title="Best for foam cannons"
                product="Chemical Guys Mr. Pink Super Suds"
                why="#1 selling foam-cannon shampoo — thick, slick, suds for days."
              />
              <PickCard
                title="Best heavy-duty"
                product="Swift Touchless Car Wash Shampoo"
                why="Alkaline formula chews through road grime and bug splatter."
              />
              <PickCard
                title="Best value (1 gallon)"
                product="Meguiar's Hyper-Wash"
                why="Commercial-grade chemistry at a body-shop price."
              />
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="container mx-auto px-4 max-w-5xl py-12">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-2">
            Touchless soap comparison table
          </h2>
          <p className="text-gray-600 mb-6">
            Specs side-by-side. Click any product name to jump to the full breakdown.
          </p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-[#0F2744]">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Product</th>
                  <th className="text-left font-semibold px-4 py-3">Size</th>
                  <th className="text-left font-semibold px-4 py-3">Price</th>
                  <th className="text-left font-semibold px-4 py-3">pH</th>
                  <th className="text-left font-semibold px-4 py-3">Ceramic-safe</th>
                  <th className="text-left font-semibold px-4 py-3">Foam-cannon</th>
                  <th className="text-left font-semibold px-4 py-3">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {products.map((p) => {
                  const spec = SOAP_SPECS[p.id as (typeof COMPARE_IDS)[number]];
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <a href={`#${p.id}`} className="font-semibold text-[#0F2744] hover:text-[#22C55E]">
                          {p.brand} {p.name.split('(')[0].trim()}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{spec.size}</td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{p.priceRange}</td>
                      <td className="px-4 py-3 text-gray-700">{spec.ph}</td>
                      <td className="px-4 py-3">
                        {spec.ceramicSafe ? (
                          <Check className="w-4 h-4 text-[#22C55E]" />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {spec.foamCannonOK ? (
                          <Check className="w-4 h-4 text-[#22C55E]" />
                        ) : (
                          <span className="text-gray-400">Bucket</span>
                        )}
                      </td>
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
            const spec = SOAP_SPECS[p.id as (typeof COMPARE_IDS)[number]];
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
                    {p.brand} {p.name.split('(')[0].trim()}
                  </h3>
                  <p className="text-gray-700 leading-relaxed mb-4">
                    {p.positioning}
                  </p>
                  <div className="text-sm text-gray-700 leading-relaxed mb-4">
                    <strong className="text-[#0F2744]">Best for:</strong> {spec.bestFor}
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-700">
                    <span><strong>Size:</strong> {spec.size}</span>
                    <span><strong>Price:</strong> {p.priceRange}</span>
                    <span><strong>pH:</strong> {spec.ph}</span>
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
              How to choose a touchless car wash soap
            </h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              Three things matter for touchless soap: <strong>pH</strong>,
              <strong> foam thickness</strong>, and <strong>protection compatibility</strong>.
            </p>
            <ul className="space-y-3 text-gray-700 leading-relaxed mb-4">
              <li>
                <strong className="text-[#0F2744]">If your car has a ceramic coating, PPF, or wax:</strong>{' '}
                pick a pH-neutral or pH-balanced soap (Optimum, Mr. Pink, Meguiar&rsquo;s,
                Adam&rsquo;s). Alkaline soaps strip protection over time.
              </li>
              <li>
                <strong className="text-[#0F2744]">If you&rsquo;re using a foam cannon:</strong>{' '}
                Mr. Pink and Meguiar&rsquo;s Hyper-Wash produce the thickest cling. Skip
                Adam&rsquo;s 16oz (best for bucket washing).
              </li>
              <li>
                <strong className="text-[#0F2744]">If your car gets gross fast</strong>{' '}
                (truck, off-road, salt-belt winters): Swift Touchless&rsquo;s heavy alkaline
                formula is the workhorse. Just don&rsquo;t use it on a ceramic-coated car
                weekly.
              </li>
            </ul>
            <p className="text-sm text-gray-600 italic">
              All five soaps in this comparison are safe to apply via foam cannon or
              pump sprayer for true no-contact washing — pair them with a{' '}
              <Link href="/shop/best-foam-cannon" className="text-[#22C55E] font-medium hover:underline">
                foam cannon
              </Link>{' '}
              and a pressure washer for the full at-home touchless setup.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-[#0F2744]">
          <div className="container mx-auto px-4 max-w-3xl py-12 text-center">
            <ShoppingBag className="w-8 h-8 text-[#22C55E] mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-white mb-3">
              See the full touchless toolkit
            </h2>
            <p className="text-blue-100 mb-6">
              Soaps are step 1. Browse our complete catalog of touchless car care gear —
              foam cannons, pressure washers, drying tools, and ceramic protection.
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
