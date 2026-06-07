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

export const revalidate = 3600; // ISR: edge-cache full-body response (replaces force-dynamic no-store bypass that caused slow TTFB); 304-bug-safe, validated on /best canary

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PAGE_PATH = '/shop/best-ceramic-coating-spray';
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;
const YEAR = new Date().getFullYear();

const TITLE = `Best Ceramic Coating Spray ${YEAR}: Chemical Guys HydroSlick vs. Meguiar's Hybrid Ceramic`;
const DESCRIPTION = `Spray-on ceramic you apply right after a wash makes every future touchless rinse shed dirt and water faster. Our top pick is Chemical Guys HydroSlick — ~6 months of durability and a deeper gloss. We compare it against Meguiar's Hybrid Ceramic Wax, the easiest-to-apply pick for beginners, for ${YEAR}.`;

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

const COMPARE_IDS = ['chemguys-hydroslick', 'meguiars-hybrid-ceramic-wax'] as const;

type CeramicSpec = {
  id: (typeof COMPARE_IDS)[number];
  application: string;
  durability: string;
  bestFor: string;
};

const CERAMIC_SPECS: Record<(typeof COMPARE_IDS)[number], CeramicSpec> = {
  'meguiars-hybrid-ceramic-wax': {
    id: 'meguiars-hybrid-ceramic-wax',
    application: 'Spray on wet, rinse off',
    durability: '~3–4 months',
    bestFor: 'Easiest application — best for beginners and routine maintenance',
  },
  'chemguys-hydroslick': {
    id: 'chemguys-hydroslick',
    application: 'Spray on, spread, buff',
    durability: '~6 months',
    bestFor: 'Longer protection and a deeper gloss for enthusiasts',
  },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "What's the difference between ceramic spray and a real ceramic coating?",
    a: 'A professional ceramic coating is a high-concentration SiO2 product that bonds for 2–5 years but requires careful paint prep and curing. A spray-on ceramic (sometimes called a ceramic spray sealant or hyperwax) is the DIY version — far easier to apply and lasts months instead of years. For most people who wash regularly, topping up a spray ceramic every few months is the simpler, cheaper way to keep that slick, hydrophobic finish.',
  },
  {
    q: 'How long does spray-on ceramic last?',
    a: 'Typically 3 to 6 months per application depending on the product, climate, and how often you wash. Meguiar\'s Hybrid Ceramic runs about 3–4 months; Chemical Guys HydroSlick leans closer to 6. Reapplying after a wash keeps protection topped up indefinitely.',
  },
  {
    q: 'Can I apply ceramic spray after a touchless car wash?',
    a: 'Yes — that\'s the ideal time. Both products are designed to go on a clean, wet (or freshly dried) car. After your touchless wash, mist it on, spread or rinse per the label, and you\'re done. It locks in protection while the paint is already clean.',
  },
  {
    q: 'Is spray ceramic safe over an existing coating or wax?',
    a: 'Yes. Spray ceramics are made to layer on top of existing protection — they refresh hydrophobics and add gloss without stripping what\'s underneath. That\'s exactly why they work so well as a between-wash maintenance topper.',
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
        name: 'Best Ceramic Coating Spray',
        item: PAGE_URL,
      },
    ],
  };
}

export default function BestCeramicSprayPage() {
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
              <span className="text-white">Best Ceramic Spray</span>
            </nav>
            <div className="flex items-center gap-3 mb-2">
              <Award className="w-8 h-8 text-[#22C55E]" />
              <h1 className="text-3xl md:text-5xl font-bold leading-tight">
                Best Ceramic Coating Spray {YEAR}
              </h1>
            </div>
            <p className="text-base md:text-lg text-[#22C55E]/90 font-semibold mb-4">
              Chemical Guys HydroSlick vs. Meguiar&rsquo;s Hybrid Ceramic
            </p>
            <p className="text-lg text-blue-100 max-w-3xl leading-relaxed">
              A spray-on ceramic applied right after your wash makes every future
              touchless rinse sheet water and shed dirt faster — so your car stays
              cleaner, longer, with less effort. Our top pick is{' '}
              <strong className="text-white">Chemical Guys HydroSlick</strong> — roughly
              six months of durability and a deeper, glossier finish. Here are the two
              we&rsquo;d buy.
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
                title="Editor's Choice — longest protection & deepest gloss"
                product="Chemical Guys HydroSlick"
                why="SiO2 hyperwax that bonds in minutes for ~6 months of slick, glossy, hydrophobic protection."
              />
              <PickCard
                title="Easiest to apply — best for beginners"
                product="Meguiar's Hybrid Ceramic Wax"
                why="Spray on the wet car, rinse off, done — zero buffing. The no-fuss pick for routine upkeep, ~3–4 months."
              />
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="container mx-auto px-4 max-w-5xl py-12">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-2">Ceramic spray comparison table</h2>
          <p className="text-gray-600 mb-6">Specs side-by-side. Click any product name to jump to the full breakdown.</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-[#0F2744]">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Product</th>
                  <th className="text-left font-semibold px-4 py-3">Price</th>
                  <th className="text-left font-semibold px-4 py-3">Application</th>
                  <th className="text-left font-semibold px-4 py-3">Durability</th>
                  <th className="text-left font-semibold px-4 py-3">Ceramic-safe</th>
                  <th className="text-left font-semibold px-4 py-3">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {products.map((p) => {
                  const spec = CERAMIC_SPECS[p.id as (typeof COMPARE_IDS)[number]];
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <a href={`#${p.id}`} className="font-semibold text-[#0F2744] hover:text-[#22C55E]">
                          {p.brand} {p.name.split('(')[0].trim()}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{p.priceRange}</td>
                      <td className="px-4 py-3 text-gray-700">{spec.application}</td>
                      <td className="px-4 py-3 text-gray-700">{spec.durability}</td>
                      <td className="px-4 py-3">
                        <Check className="w-4 h-4 text-[#22C55E]" />
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
            const spec = CERAMIC_SPECS[p.id as (typeof COMPARE_IDS)[number]];
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
                    <span><strong>Application:</strong> {spec.application}</span>
                    <span><strong>Durability:</strong> {spec.durability}</span>
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
              How to choose (and why touchless washers love spray ceramic)
            </h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              The whole point of touchless washing is letting water and chemistry do
              the work instead of a sponge. A ceramic topper supercharges that: a slick,
              hydrophobic surface means dirt has less to grip and rinses off faster every
              time. Pick based on how much effort you want to spend:
            </p>
            <ul className="space-y-3 text-gray-700 leading-relaxed mb-4">
              <li>
                <strong className="text-[#0F2744]">Want zero extra steps?</strong>{' '}
                Meguiar&rsquo;s Hybrid Ceramic sprays onto the wet car and rinses off as
                part of the wash. Nothing to buff.
              </li>
              <li>
                <strong className="text-[#0F2744]">Want maximum gloss & longevity?</strong>{' '}
                HydroSlick takes a few extra minutes to spread and buff but rewards you
                with a deeper shine and roughly double the durability.
              </li>
              <li>
                <strong className="text-[#0F2744]">Subscribe to an unlimited plan?</strong>{' '}
                A ceramic topper makes each visit to your{' '}
                <Link href="/unlimited-touchless-car-wash" className="text-[#22C55E] font-medium hover:underline">
                  unlimited touchless wash
                </Link>{' '}
                do more — water sheets off and the car dries faster.
              </li>
            </ul>
            <p className="text-sm text-gray-600 italic">
              Apply it as the last step of a full wash. See the complete routine in our{' '}
              <Link href="/shop/touchless-car-wash-at-home" className="text-[#22C55E] font-medium hover:underline">
                at-home touchless wash guide
              </Link>.
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
              Protection is the finishing step. See the complete at-home touchless kit —
              soap, foam, pressure washer, drying, and ceramic.
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
