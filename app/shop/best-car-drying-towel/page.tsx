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
const PAGE_PATH = '/shop/best-car-drying-towel';
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;
const YEAR = new Date().getFullYear();

const TITLE = `How to Dry Your Car Without Scratches ${YEAR}: Best Drying Towel & Air Blower`;
const DESCRIPTION = `Drying is where most swirl marks happen. Learn how to dry your car scratch-free and compare the best no-contact air blower and the safest microfiber drying towel for ${YEAR}.`;

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

const COMPARE_IDS = ['metrovac-master-blaster', 'chemguys-woolly-mammoth-towel'] as const;

type DrySpec = {
  id: (typeof COMPARE_IDS)[number];
  method: string;
  contact: string;
  bestFor: string;
};

const DRY_SPECS: Record<(typeof COMPARE_IDS)[number], DrySpec> = {
  'metrovac-master-blaster': {
    id: 'metrovac-master-blaster',
    method: 'Air blower',
    contact: 'Zero contact',
    bestFor: 'The truly scratch-free finish — blows water out of every crevice',
  },
  'chemguys-woolly-mammoth-towel': {
    id: 'chemguys-woolly-mammoth-towel',
    method: 'Plush microfiber',
    contact: 'Light contact',
    bestFor: 'Glass, jambs, and the final scratch-free wipe the blower misses',
  },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I dry my car without scratching it?',
    a: 'The safest method is no contact at all: an air blower pushes water off the paint without ever touching it, so there is nothing to drag grit across the clearcoat. For the few spots a blower can\'t reach, use a clean, plush microfiber drying towel and the blot-and-glide technique — lay it flat, pull it gently, never scrub. Most swirl marks come from drying a not-quite-rinsed car with a coarse towel, so rinse thoroughly first.',
  },
  {
    q: 'Are microfiber towels safe for car paint?',
    a: 'A high-GSM (plush, 1,000+) microfiber towel that is clean and used gently is safe and is the detailer standard. Damage comes from using a dirty towel, a low-quality flat-weave cloth, or pressing hard. Wash microfiber separately from regular laundry and never with fabric softener.',
  },
  {
    q: 'Is an air blower worth it for drying a car?',
    a: 'If you care about a swirl-free finish — especially on a dark or ceramic-coated car — yes. Zero-contact drying eliminates the single most common source of wash-induced scratches, and it clears water from mirrors, grilles, and badges that towels just smear around.',
  },
  {
    q: 'Should I let my car air dry instead?',
    a: 'No. Air drying leaves mineral water spots that etch into the clearcoat over time, especially in hard-water areas or direct sun. Blow or blot the water off while the panels are still wet.',
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
        name: 'How to Dry Your Car Without Scratches',
        item: PAGE_URL,
      },
    ],
  };
}

export default function BestDryingPage() {
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
              <span className="text-white">Dry Without Scratches</span>
            </nav>
            <div className="flex items-center gap-3 mb-2">
              <Award className="w-8 h-8 text-[#22C55E]" />
              <h1 className="text-3xl md:text-5xl font-bold leading-tight">
                How to Dry Your Car Without Scratches
              </h1>
            </div>
            <p className="text-base md:text-lg text-[#22C55E]/90 font-semibold mb-4">
              The best no-contact air blower & safest drying towel for {YEAR}
            </p>
            <p className="text-lg text-blue-100 max-w-3xl leading-relaxed">
              You can do a perfect touchless wash and still put swirl marks in your
              paint at the very last step — drying. Here&rsquo;s how to dry scratch-free,
              plus the two tools that make it foolproof.
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
                title="Best no-contact drying"
                product="MetroVac Air Force Blaster Sidekick"
                why="Blows water off the car with zero contact — the only way to dry with no scratch risk at all."
              />
              <PickCard
                title="Best drying towel"
                product="Chemical Guys Woolly Mammoth"
                why="Plush 1-inch microfiber that holds nearly a gallon of water, with silk-banded edges and ceramic/PPF-safe — for glass, jambs, and the final scratch-free wipe."
              />
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="container mx-auto px-4 max-w-5xl py-12">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-2">Drying tool comparison</h2>
          <p className="text-gray-600 mb-6">The two work together — most people use the blower first, then the towel for cleanup.</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-[#0F2744]">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Product</th>
                  <th className="text-left font-semibold px-4 py-3">Method</th>
                  <th className="text-left font-semibold px-4 py-3">Price</th>
                  <th className="text-left font-semibold px-4 py-3">Paint contact</th>
                  <th className="text-left font-semibold px-4 py-3">Scratch risk</th>
                  <th className="text-left font-semibold px-4 py-3">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {products.map((p) => {
                  const spec = DRY_SPECS[p.id as (typeof COMPARE_IDS)[number]];
                  const zeroContact = spec.contact === 'Zero contact';
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <a href={`#${p.id}`} className="font-semibold text-[#0F2744] hover:text-[#22C55E]">
                          {p.brand} {p.name.split('(')[0].trim()}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{spec.method}</td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{p.priceRange}</td>
                      <td className="px-4 py-3 text-gray-700">{spec.contact}</td>
                      <td className="px-4 py-3">
                        {zeroContact ? (
                          <span className="inline-flex items-center gap-1 text-[#22C55E] font-medium">
                            <Check className="w-4 h-4" /> None
                          </span>
                        ) : (
                          <span className="text-gray-500">Low (if clean)</span>
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
            const spec = DRY_SPECS[p.id as (typeof COMPARE_IDS)[number]];
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
                    <span><strong>Method:</strong> {spec.method}</span>
                    <span><strong>Price:</strong> {p.priceRange}</span>
                    <span><strong>Rating:</strong> &#11088; {p.rating}/5</span>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* How to dry */}
        <section className="bg-gray-50 border-t border-gray-200">
          <div className="container mx-auto px-4 max-w-3xl py-12">
            <h2 className="text-2xl font-bold text-[#0F2744] mb-4">
              The scratch-free drying method
            </h2>
            <ol className="space-y-3 text-gray-700 leading-relaxed mb-4 list-decimal pl-5">
              <li><strong className="text-[#0F2744]">Rinse until the water sheets off.</strong> Any grit left on the panel is what scratches — a thorough final rinse matters more than the towel.</li>
              <li><strong className="text-[#0F2744]">Blow the bulk of the water off.</strong> Start at the roof and work down, clearing mirrors, grilles, and badges where water hides.</li>
              <li><strong className="text-[#0F2744]">Blot, don&rsquo;t scrub.</strong> For the last damp spots, lay a clean microfiber flat and pull it gently — never press and rub.</li>
              <li>
                <strong className="text-[#0F2744]">Add protection while damp.</strong> A spray-on{' '}
                <Link href="/shop/best-ceramic-coating-spray" className="text-[#22C55E] font-medium hover:underline">ceramic topper</Link>{' '}
                makes the next wash dry even faster.
              </li>
            </ol>
            <p className="text-sm text-gray-600 italic">
              Drying is the last step of the kit. See the full no-contact routine in our{' '}
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
              Scratch-free drying is the finishing touch. See the complete at-home
              touchless kit from rinse to protection.
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
