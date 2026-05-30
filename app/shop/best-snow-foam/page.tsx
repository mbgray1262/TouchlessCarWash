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
const PAGE_PATH = '/shop/best-snow-foam';
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;
const YEAR = new Date().getFullYear();

const TITLE = `Best Snow Foam for Touchless Car Washing ${YEAR}: Honeydew vs. Adam's Mega Foam`;
const DESCRIPTION = `Snow foam is the most important step in a no-contact wash. We compare Chemical Guys Honeydew Snow Foam and Adam's Mega Foam on cling, dilution, ceramic-safety, and value for ${YEAR}.`;

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

const COMPARE_IDS = ['chemguys-honeydew-snow-foam', 'adams-mega-foam'] as const;

type FoamSpec = {
  id: (typeof COMPARE_IDS)[number];
  size: string;
  dilution: string;
  ceramicSafe: boolean;
  bestFor: string;
};

const FOAM_SPECS: Record<(typeof COMPARE_IDS)[number], FoamSpec> = {
  'chemguys-honeydew-snow-foam': {
    id: 'chemguys-honeydew-snow-foam',
    size: '1 gallon',
    dilution: 'Up to 100:1',
    ceramicSafe: true,
    bestFor: 'Best value per wash — a gallon lasts months',
  },
  'adams-mega-foam': {
    id: 'adams-mega-foam',
    size: '16 oz',
    dilution: '10× concentrate',
    ceramicSafe: true,
    bestFor: 'Try-it-first size from a cult DIY brand',
  },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "What's the difference between snow foam and car wash soap?",
    a: 'Snow foam is a pre-wash. It goes on a dry car first, clings to the panels, and lifts loose grit and road film into suspension so it rinses away before you ever touch the paint. Car wash soap is what you use during the contact wash step. In a true touchless wash, thick snow foam does most of the work a sponge would otherwise do.',
  },
  {
    q: 'Do I need a foam cannon for snow foam?',
    a: "For the thick, clinging blanket of foam you want, yes — a foam cannon attached to a pressure washer mixes the soap with air. You can apply snow foam through a pump sprayer in a pinch, but the foam is thinner and dwells for less time. See our foam cannon and pressure washer guides to complete the setup.",
  },
  {
    q: 'Will snow foam alone clean my car?',
    a: 'On a lightly soiled car, a generous snow-foam pre-wash plus a thorough pressure rinse gets you most of the way there with zero contact. On a heavily soiled car you may still want a follow-up wash with touchless soap. Either way, foaming first dramatically cuts the grit that causes swirl marks.',
  },
  {
    q: 'Is snow foam safe for ceramic coatings and wax?',
    a: 'Both foams here are pH-balanced and safe for ceramic coatings, PPF, and wax — they clean without stripping protection. Avoid heavy-duty alkaline degreasers for routine washing if your car is coated.',
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
        name: 'Best Snow Foam',
        item: PAGE_URL,
      },
    ],
  };
}

export default function BestSnowFoamPage() {
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
              <span className="text-white">Best Snow Foam</span>
            </nav>
            <div className="flex items-center gap-3 mb-2">
              <Award className="w-8 h-8 text-[#22C55E]" />
              <h1 className="text-3xl md:text-5xl font-bold leading-tight">
                Best Snow Foam for Touchless Washing {YEAR}
              </h1>
            </div>
            <p className="text-base md:text-lg text-[#22C55E]/90 font-semibold mb-4">
              Chemical Guys Honeydew vs. Adam&rsquo;s Mega Foam
            </p>
            <p className="text-lg text-blue-100 max-w-3xl leading-relaxed">
              Snow foam is the single most important step in a no-contact wash —
              it lifts grit off your paint before anything touches it. We compared
              the two foams most DIY washers reach for, on cling, dilution, and
              cost per wash.
            </p>
            <p className="text-xs text-white/60 italic mt-4 max-w-3xl">
              Editor-tested picks. We earn from qualifying purchases as Amazon
              Associates and Chemical Guys affiliates — links don&rsquo;t change your price.
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
                product="Chemical Guys Honeydew Snow Foam"
                why="Thick cling, high dilution, and a gallon that lasts months. The one to buy if you wash regularly."
              />
              <PickCard
                title="Best starter size"
                product="Adam's Mega Foam"
                why="10× concentrate in a 16oz bottle — the low-commitment way to try foaming before buying a gallon."
              />
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="container mx-auto px-4 max-w-5xl py-12">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-2">Snow foam comparison table</h2>
          <p className="text-gray-600 mb-6">Specs side-by-side. Click any product name to jump to the full breakdown.</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-[#0F2744]">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Product</th>
                  <th className="text-left font-semibold px-4 py-3">Size</th>
                  <th className="text-left font-semibold px-4 py-3">Price</th>
                  <th className="text-left font-semibold px-4 py-3">Dilution</th>
                  <th className="text-left font-semibold px-4 py-3">Ceramic-safe</th>
                  <th className="text-left font-semibold px-4 py-3">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {products.map((p) => {
                  const spec = FOAM_SPECS[p.id as (typeof COMPARE_IDS)[number]];
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <a href={`#${p.id}`} className="font-semibold text-[#0F2744] hover:text-[#22C55E]">
                          {p.brand} {p.name.split('(')[0].trim()}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{spec.size}</td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{p.priceRange}</td>
                      <td className="px-4 py-3 text-gray-700">{spec.dilution}</td>
                      <td className="px-4 py-3">
                        {spec.ceramicSafe ? (
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
            const spec = FOAM_SPECS[p.id as (typeof COMPARE_IDS)[number]];
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
                    <span><strong>Size:</strong> {spec.size}</span>
                    <span><strong>Price:</strong> {p.priceRange}</span>
                    <span><strong>Dilution:</strong> {spec.dilution}</span>
                    <span><strong>Rating:</strong> &#11088; {p.rating}/5</span>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* How to use */}
        <section className="bg-gray-50 border-t border-gray-200">
          <div className="container mx-auto px-4 max-w-3xl py-12">
            <h2 className="text-2xl font-bold text-[#0F2744] mb-4">
              How to snow foam your car (the right way)
            </h2>
            <ol className="space-y-3 text-gray-700 leading-relaxed mb-4 list-decimal pl-5">
              <li><strong className="text-[#0F2744]">Rinse first.</strong> Knock off loose dirt with a plain water rinse.</li>
              <li>
                <strong className="text-[#0F2744]">Apply foam top-down.</strong> Load your{' '}
                <Link href="/shop/best-foam-cannon" className="text-[#22C55E] font-medium hover:underline">foam cannon</Link>{' '}
                and coat the whole car in a thick layer.
              </li>
              <li><strong className="text-[#0F2744]">Let it dwell 3–5 minutes.</strong> Don&rsquo;t let it dry — work in shade. The foam pulls grit off as it slides down.</li>
              <li><strong className="text-[#0F2744]">Rinse thoroughly</strong> with your pressure washer, top to bottom.</li>
            </ol>
            <p className="text-sm text-gray-600 italic">
              Snow foam is one piece of the kit. Pair it with a{' '}
              <Link href="/shop/best-foam-cannon" className="text-[#22C55E] font-medium hover:underline">foam cannon</Link>,{' '}
              <Link href="/shop/best-pressure-washer-for-cars" className="text-[#22C55E] font-medium hover:underline">pressure washer</Link>, and{' '}
              <Link href="/shop/best-touchless-car-wash-soap" className="text-[#22C55E] font-medium hover:underline">touchless soap</Link>{' '}
              for the complete no-contact wash.
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
              Foam is the first step. See the complete at-home touchless kit — pressure
              washer, foam cannon, soap, drying, and protection.
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
