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
const PAGE_PATH = '/shop/best-pressure-washer-for-cars';
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;
const YEAR = new Date().getFullYear();

const TITLE = `Best Pressure Washer for Washing Your Car ${YEAR}: Sun Joe vs. Westinghouse`;
const DESCRIPTION = `The best electric pressure washers for touchless car washing in ${YEAR}. We compare the Sun Joe SPX3000 and Westinghouse ePX3100 on PSI, GPM, foam-cannon compatibility, and paint safety — with a clear pick for each budget.`;

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

const COMPARE_IDS = ['sun-joe-spx3000', 'westinghouse-epx3100'] as const;

type WasherSpec = {
  id: (typeof COMPARE_IDS)[number];
  psi: string;
  gpm: string;
  soapTank: string;
  foamCannonOK: boolean;
  bestFor: string;
};

const WASHER_SPECS: Record<(typeof COMPARE_IDS)[number], WasherSpec> = {
  'sun-joe-spx3000': {
    id: 'sun-joe-spx3000',
    psi: '2,030 PSI',
    gpm: '1.76 GPM',
    soapTank: 'Dual 0.9 L tanks',
    foamCannonOK: true,
    bestFor: 'Best-selling budget pick — the safe default for most cars',
  },
  'westinghouse-epx3100': {
    id: 'westinghouse-epx3100',
    psi: '2,300 PSI',
    gpm: '1.76 GPM',
    soapTank: 'Onboard tank + hose reel',
    foamCannonOK: true,
    bestFor: 'Premium build, anti-tip frame, more reach for trucks & SUVs',
  },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Will a pressure washer damage my car paint?',
    a: "Not in the car-wash PSI range. Anything from roughly 1,500 to 2,500 PSI is safe for automotive paint as long as you keep the nozzle at least 12 inches away and use a wide-angle (25° or 40°) tip — never the zero-degree red tip on paint. Both washers here sit in that safe window. The point of touchless washing is to let the soap and water do the work, not to blast the panel.",
  },
  {
    q: 'What PSI is best for washing a car?',
    a: 'The sweet spot is 1,900–2,500 PSI. Below that you struggle to rinse thick foam; above it you gain nothing for cars and only raise the risk of stripping wax or forcing water past trim seals. The Sun Joe (2,030) and Westinghouse (2,300) both land in this range.',
  },
  {
    q: 'Do I need a pressure washer to use a foam cannon?',
    a: "Yes. A foam cannon relies on the high water flow a pressure washer provides to mix soap with air into thick clinging foam — a garden hose can't generate enough pressure. Both washers on this page produce the ~1.4+ GPM flow a foam cannon needs.",
  },
  {
    q: 'Electric or gas pressure washer for car washing?',
    a: 'Electric, almost always. Gas units make more pressure than a car needs, are louder, require fuel and maintenance, and produce exhaust you do not want around a freshly washed car. Electric washers in the 2,000–2,500 PSI range are quieter, lighter, start instantly, and are the right tool for at-home touchless washing.',
  },
];

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

function buildFaqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
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
        name: 'Best Pressure Washer for Cars',
        item: PAGE_URL,
      },
    ],
  };
}

export default function BestPressureWasherPage() {
  const products = getProducts(COMPARE_IDS);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildReviewListJsonLd(products)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqJsonLd()) }}
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
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              <span>/</span>
              <Link href="/shop" className="hover:text-white transition-colors">Shop</Link>
              <span>/</span>
              <span className="text-white">Best Pressure Washer</span>
            </nav>
            <div className="flex items-center gap-3 mb-2">
              <Award className="w-8 h-8 text-[#22C55E]" />
              <h1 className="text-3xl md:text-5xl font-bold leading-tight">
                Best Pressure Washer for Washing Your Car {YEAR}
              </h1>
            </div>
            <p className="text-base md:text-lg text-[#22C55E]/90 font-semibold mb-4">
              Sun Joe SPX3000 vs. Westinghouse ePX3100
            </p>
            <p className="text-lg text-blue-100 max-w-3xl leading-relaxed">
              A pressure washer is the engine of an at-home touchless wash — it
              rinses thick foam and powers your foam cannon. We compared the two
              electric washers most car owners actually buy on PSI, water flow,
              and paint safety.
            </p>
            <p className="text-xs text-white/60 italic mt-4 max-w-3xl">
              Editor-tested picks. We earn from qualifying purchases as Amazon
              Associates — links don&rsquo;t change your price.
            </p>
          </div>
        </section>

        {/* TL;DR */}
        <section className="bg-gray-50 border-b border-gray-200">
          <div className="container mx-auto px-4 max-w-5xl py-10">
            <h2 className="text-xl font-bold text-[#0F2744] mb-5">Quick winners by use case</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <PickCard
                title="Best overall / best value"
                product="Sun Joe SPX3000"
                why="2,030 PSI, dual soap tanks, and Amazon's best-selling electric washer for years. The safe default."
              />
              <PickCard
                title="Best premium pick"
                product="Westinghouse ePX3100"
                why="2,300 PSI, anti-tip frame, onboard tank and hose reel — more reach and durability for trucks and SUVs."
              />
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="container mx-auto px-4 max-w-5xl py-12">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-2">Pressure washer comparison table</h2>
          <p className="text-gray-600 mb-6">Specs side-by-side. Click any product name to jump to the full breakdown.</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-[#0F2744]">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Product</th>
                  <th className="text-left font-semibold px-4 py-3">PSI</th>
                  <th className="text-left font-semibold px-4 py-3">Flow</th>
                  <th className="text-left font-semibold px-4 py-3">Price</th>
                  <th className="text-left font-semibold px-4 py-3">Soap tank</th>
                  <th className="text-left font-semibold px-4 py-3">Foam-cannon</th>
                  <th className="text-left font-semibold px-4 py-3">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {products.map((p) => {
                  const spec = WASHER_SPECS[p.id as (typeof COMPARE_IDS)[number]];
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <a href={`#${p.id}`} className="font-semibold text-[#0F2744] hover:text-[#22C55E]">
                          {p.brand} {p.name.split('(')[0].trim()}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{spec.psi}</td>
                      <td className="px-4 py-3 text-gray-700">{spec.gpm}</td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{p.priceRange}</td>
                      <td className="px-4 py-3 text-gray-700">{spec.soapTank}</td>
                      <td className="px-4 py-3">
                        {spec.foamCannonOK ? (
                          <Check className="w-4 h-4 text-[#22C55E]" />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">&#11088; {p.rating}</td>
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
            const spec = WASHER_SPECS[p.id as (typeof COMPARE_IDS)[number]];
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
                  <p className="text-gray-700 leading-relaxed mb-4">{p.positioning}</p>
                  <div className="text-sm text-gray-700 leading-relaxed mb-4">
                    <strong className="text-[#0F2744]">Best for:</strong> {spec.bestFor}
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-700">
                    <span><strong>PSI:</strong> {spec.psi}</span>
                    <span><strong>Flow:</strong> {spec.gpm}</span>
                    <span><strong>Price:</strong> {p.priceRange}</span>
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
              How to choose a pressure washer for car washing
            </h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              For cars, three numbers matter: <strong>PSI</strong> (pressure),
              <strong> GPM</strong> (water flow), and the <strong>nozzle</strong> you use.
            </p>
            <ul className="space-y-3 text-gray-700 leading-relaxed mb-4">
              <li>
                <strong className="text-[#0F2744]">PSI — aim for 1,900–2,500.</strong>{' '}
                Enough to rinse dense foam, not so much that you risk paint or trim.
                Both washers here are in range.
              </li>
              <li>
                <strong className="text-[#0F2744]">GPM — 1.4 or higher if you want foam.</strong>{' '}
                Your{' '}
                <Link href="/shop/best-foam-cannon" className="text-[#22C55E] font-medium hover:underline">
                  foam cannon
                </Link>{' '}
                needs flow to make thick suds. Both units deliver 1.76 GPM.
              </li>
              <li>
                <strong className="text-[#0F2744]">Nozzle — use 25° or 40°, never 0°.</strong>{' '}
                The wide-angle tips clean paint safely. Keep the zero-degree tip for
                concrete only, and stay 12+ inches from the panel.
              </li>
            </ul>
            <p className="text-sm text-gray-600 italic">
              A pressure washer is step one of the kit. Pair it with{' '}
              <Link href="/shop/best-snow-foam" className="text-[#22C55E] font-medium hover:underline">
                snow foam
              </Link>
              , a{' '}
              <Link href="/shop/best-foam-cannon" className="text-[#22C55E] font-medium hover:underline">
                foam cannon
              </Link>
              , and{' '}
              <Link href="/shop/best-touchless-car-wash-soap" className="text-[#22C55E] font-medium hover:underline">
                touchless soap
              </Link>{' '}
              for a full no-contact wash.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <Faq />

        {/* CTA */}
        <section className="bg-[#0F2744]">
          <div className="container mx-auto px-4 max-w-3xl py-12 text-center">
            <ShoppingBag className="w-8 h-8 text-[#22C55E] mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-white mb-3">Build the full touchless setup</h2>
            <p className="text-blue-100 mb-6">
              A pressure washer is the foundation. See the complete at-home touchless
              kit — soap, foam, drying, and protection.
            </p>
            <Link
              href="/shop/touchless-car-wash-at-home"
              className="inline-flex items-center gap-2 bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              See the complete kit &rarr;
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

function Faq() {
  return (
    <section className="container mx-auto px-4 max-w-3xl py-12">
      <h2 className="text-2xl font-bold text-[#0F2744] mb-6">Frequently asked questions</h2>
      <div className="space-y-6">
        {FAQS.map((f) => (
          <div key={f.q}>
            <h3 className="font-semibold text-[#0F2744] mb-1.5">{f.q}</h3>
            <p className="text-gray-700 leading-relaxed">{f.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PickCard({ title, product, why }: { title: string; product: string; why: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#22C55E] mb-1.5">{title}</div>
      <div className="font-semibold text-[#0F2744] mb-1">{product}</div>
      <p className="text-sm text-gray-600 leading-relaxed">{why}</p>
    </div>
  );
}
