import Link from 'next/link';
import type { Metadata } from 'next';
import { ShoppingBag, Sparkles, ArrowRight } from 'lucide-react';
import { ProductCard } from '@/components/ProductCard';
import { getProduct, type Product } from '@/lib/affiliate-products';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

export const dynamic = 'force-dynamic';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PAGE_PATH = '/shop/touchless-car-wash-at-home';
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;
const YEAR = new Date().getFullYear();

const TITLE = `How to Touchless Wash Your Car at Home ${YEAR}: The Complete No-Contact Kit & Steps`;
const DESCRIPTION = `A step-by-step guide to washing your car at home with zero contact — the exact gear and order of operations for a scratch-free touchless wash, from snow foam to ceramic protection.`;

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

type Step = {
  n: number;
  title: string;
  body: string;
  productId: string;
  guideHref: string;
  guideLabel: string;
};

const STEPS: Step[] = [
  {
    n: 1,
    title: 'Pressure washer — the engine',
    body: 'Everything starts with water pressure. An electric washer in the 2,000–2,500 PSI range rinses thick foam and powers your foam cannon, without the risk of damaging paint.',
    productId: 'sun-joe-spx3000',
    guideHref: '/shop/best-pressure-washer-for-cars',
    guideLabel: 'Compare the best pressure washers',
  },
  {
    n: 2,
    title: 'Snow foam — the pre-wash',
    body: 'Coat the dry car in thick foam and let it dwell. This is the step that lifts grit off the paint so it rinses away before anything touches the surface — the heart of no-contact washing.',
    productId: 'chemguys-honeydew-snow-foam',
    guideHref: '/shop/best-snow-foam',
    guideLabel: 'Compare the best snow foams',
  },
  {
    n: 3,
    title: 'Foam cannon — the applicator',
    body: 'The cannon attaches to your pressure washer and whips soap into a clinging blanket of suds. Thicker foam means more dwell time and more dirt lifted hands-free.',
    productId: 'chemguys-torq-max-foam-8',
    guideHref: '/shop/best-foam-cannon',
    guideLabel: 'Compare the best foam cannons',
  },
  {
    n: 4,
    title: 'Touchless soap — the cleaner',
    body: 'A high-foaming, pH-appropriate soap does the chemical work a sponge would otherwise do. Chemical Guys Mr. Pink is our go-to here — pH-balanced and ceramic-coating safe, it whips into thick suds through a foam cannon for maximum cling and is gentle enough for any finish.',
    productId: 'chemguys-mr-pink-super-suds',
    guideHref: '/shop/best-touchless-car-wash-soap',
    guideLabel: 'Compare the best touchless soaps',
  },
  {
    n: 5,
    title: 'Dry without scratches',
    body: 'The last step is where swirl marks sneak in. Blow the water off with no contact, then blot the rest with a plush microfiber — never scrub a damp panel.',
    productId: 'metrovac-master-blaster',
    guideHref: '/shop/best-car-drying-towel',
    guideLabel: 'How to dry without scratches',
  },
  {
    n: 6,
    title: 'Protect — make the next wash easier',
    body: 'Spread on a spray ceramic like Chemical Guys HydroSlick while the car is still damp. This SiO2 hyperwax bonds in minutes and leaves a slick, hydrophobic layer that lasts around six months — so future washes shed dirt and water faster and your car stays glossy and clean longer.',
    productId: 'chemguys-hydroslick',
    guideHref: '/shop/best-ceramic-coating-spray',
    guideLabel: 'Compare the best ceramic sprays',
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Can you really wash a car touchless at home?',
    a: 'Yes. With a pressure washer, a foam cannon, snow foam, and the right soap, you can lift and rinse away the vast majority of dirt without a sponge or mitt ever touching the paint — the same principle commercial touchless bays use. A no-contact air blower finishes the job scratch-free.',
  },
  {
    q: 'What do I need for an at-home touchless car wash?',
    a: 'Six things, in order: an electric pressure washer, snow foam, a foam cannon, touchless car wash soap, a no-contact drying method (air blower plus a plush microfiber), and optionally a spray ceramic for protection. Each step has its own buying guide linked above.',
  },
  {
    q: 'Is touchless washing at home better than a sponge wash?',
    a: 'For your paint, generally yes. The biggest cause of swirl marks is dragging trapped grit across the clearcoat with a wash mitt. Lifting that grit off with foam and rinsing it away first dramatically reduces contact damage.',
  },
  {
    q: 'How much does a home touchless setup cost?',
    a: 'A solid starter kit runs roughly $250–350: about $160 for a pressure washer, $35–100 for a foam cannon, and $40–80 for foam, soap, and protection. It pays for itself quickly versus repeated trips to a wash, and the gear lasts years.',
  },
];

function buildHowToJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Touchless Wash Your Car at Home',
    description: DESCRIPTION,
    url: PAGE_URL,
    step: STEPS.map((s) => ({
      '@type': 'HowToStep',
      position: s.n,
      name: s.title,
      text: s.body,
      url: `${PAGE_URL}#step-${s.n}`,
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
        name: 'Touchless Car Wash at Home',
        item: PAGE_URL,
      },
    ],
  };
}

export default function TouchlessAtHomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildHowToJsonLd()) }}
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
              <span className="text-white">Touchless Wash at Home</span>
            </nav>
            <div className="flex items-center gap-3 mb-2">
              <Sparkles className="w-8 h-8 text-[#22C55E]" />
              <h1 className="text-3xl md:text-5xl font-bold leading-tight">
                How to Touchless Wash Your Car at Home
              </h1>
            </div>
            <p className="text-base md:text-lg text-[#22C55E]/90 font-semibold mb-4">
              The complete no-contact kit & step-by-step routine for {YEAR}
            </p>
            <p className="text-lg text-blue-100 max-w-3xl leading-relaxed">
              Touchless washing means dirt gets lifted and rinsed away before anything
              touches your paint — the same idea behind commercial touchless bays. Here&rsquo;s
              the exact gear and order of operations to do it in your own driveway,
              scratch-free.
            </p>
            <p className="text-xs text-white/60 italic mt-4 max-w-3xl">
              We earn from qualifying purchases as Amazon Associates and Chemical Guys
              affiliates — links don&rsquo;t change your price.
            </p>
          </div>
        </section>

        {/* Intro / why */}
        <section className="bg-gray-50 border-b border-gray-200">
          <div className="container mx-auto px-4 max-w-3xl py-10">
            <h2 className="text-xl font-bold text-[#0F2744] mb-3">Why touchless, even at home?</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              Most swirl marks and fine scratches come from one thing: dragging trapped
              grit across the clearcoat with a sponge or wash mitt. Touchless washing
              removes that risk by lifting dirt off the surface with thick foam and high-pressure
              water, then rinsing it away — no rubbing required.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Prefer to let a pro do it? You can always{' '}
              <Link href="/" className="text-[#22C55E] font-medium hover:underline">
                find a verified touchless car wash near you
              </Link>
              . But if you want to do it yourself, here&rsquo;s the whole kit — each step links
              to its own comparison guide.
            </p>
          </div>
        </section>

        {/* Steps */}
        <section className="container mx-auto px-4 max-w-5xl py-12 space-y-12">
          {STEPS.map((step) => {
            const product = getProduct(step.productId) as Product;
            return (
              <article
                key={step.n}
                id={`step-${step.n}`}
                className="scroll-mt-24 grid md:grid-cols-[280px_1fr] gap-8 items-start border-t border-gray-200 pt-12 first:border-t-0 first:pt-0"
              >
                <div className="w-full max-w-[280px]">
                  {product && <ProductCard product={product} variant="card" />}
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#22C55E] mb-2">
                    Step {step.n}
                  </div>
                  <h2 className="text-2xl font-bold text-[#0F2744] mb-3">{step.title}</h2>
                  <p className="text-gray-700 leading-relaxed mb-4">{step.body}</p>
                  <Link
                    href={step.guideHref}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#22C55E] hover:underline"
                  >
                    {step.guideLabel} <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </article>
            );
          })}
        </section>

        {/* FAQ */}
        <section className="bg-gray-50 border-t border-gray-200">
          <div className="container mx-auto px-4 max-w-3xl py-12">
            <h2 className="text-2xl font-bold text-[#0F2744] mb-6">Frequently asked questions</h2>
            <div className="space-y-6">
              {FAQS.map((f) => (
                <div key={f.q}>
                  <h3 className="font-semibold text-[#0F2744] mb-1.5">{f.q}</h3>
                  <p className="text-gray-700 leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-[#0F2744]">
          <div className="container mx-auto px-4 max-w-3xl py-12 text-center">
            <ShoppingBag className="w-8 h-8 text-[#22C55E] mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-white mb-3">Browse the full touchless shop</h2>
            <p className="text-blue-100 mb-6">
              Every product in this guide — plus more soaps, wheel care, and interior
              picks — organized by category.
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
