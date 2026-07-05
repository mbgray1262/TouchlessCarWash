import Link from 'next/link';
import { ChevronRight, Check, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { publicListings } from '@/lib/public-listings';
import { CHAINS } from '@/lib/chains';
import { getChainSubscriptionDisplay } from '@/lib/chain-subscriptions';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';
import { US_STATES, getStateName, getStateSlug } from '@/lib/constants';
import { ProductGrid } from '@/components/ProductGrid';
import { ProductSpotlight } from '@/components/ProductSpotlight';
import type { Metadata } from 'next';

export const revalidate = 3600;

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PAGE_PATH = '/unlimited-touchless-car-wash';

// Curated list of touchless chains that publish unlimited/monthly membership plans.
// Based on chain description text and publicly verified programs.
const UNLIMITED_CHAIN_SLUGS = new Set([
  'sheetz',
  'delta-sonic',
  'drive-and-shine',
  'kwik-trip',
  'splash-car-wash',
  'prestige-car-wash',
  'flagstop-car-wash',
  'foam-and-wash',
  'mr-magic-car-wash',
  'autowash',
  'super-wash',
  'brown-bear',
  'holiday-stationstores',
  'salty-dog-car-wash',
  'power-market',
  'extra-mile',
  'pinnacle-365',
]);

type ChainRow = {
  name: string;
  slug: string;
  count: number;
  states: string[];
  priceLabel: string;
  planName: string | null;
};

async function getUnlimitedChains(): Promise<ChainRow[]> {
  const results: ChainRow[] = [];
  for (const chain of CHAINS) {
    if (!UNLIMITED_CHAIN_SLUGS.has(chain.slug)) continue;
    const { data } = await publicListings('state')
      .eq('parent_chain', chain.name);
    if (!data || data.length === 0) continue;
    const states = Array.from(new Set(data.map(r => r.state))).sort();
    const sub = getChainSubscriptionDisplay(chain.slug);
    results.push({
      name: chain.name,
      slug: chain.slug,
      count: data.length,
      states,
      priceLabel: sub?.priceLabel ?? 'Monthly plan available',
      planName: sub?.planName ?? null,
    });
  }
  return results.sort((a, b) => b.count - a.count);
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Unlimited Touchless Car Wash Subscriptions — Monthly Plans & Memberships',
    description:
      'Compare unlimited touchless car wash subscription plans. Monthly memberships from Sheetz, Delta Sonic, Drive & Shine, Kwik Trip and more — all brushless, scratch-free.',
    alternates: { canonical: `${SITE_URL}${PAGE_PATH}` },
    openGraph: {
      title: 'Unlimited Touchless Car Wash Subscriptions — Monthly Plans',
      description:
        'Compare unlimited touchless car wash subscription plans across the top brushless car wash chains.',
      url: `${SITE_URL}${PAGE_PATH}`,
      siteName: 'Touchless Car Wash Finder',
      type: 'website',
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function UnlimitedHubPage() {
  const chains = await getUnlimitedChains();
  const totalLocations = chains.reduce((s, c) => s + c.count, 0);
  const totalStateSet = new Set<string>();
  chains.forEach(c => c.states.forEach(s => totalStateSet.add(s)));

  const now = new Date();
  const year = now.getFullYear();

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Unlimited Touchless Car Wash', item: `${SITE_URL}${PAGE_PATH}` },
    ],
  };

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Unlimited Touchless Car Wash Subscription',
    serviceType: 'Car Wash Subscription',
    description:
      'Monthly unlimited touchless car wash memberships. Flat monthly fee for unlimited brushless, scratch-free washes at participating locations.',
    provider: {
      '@type': 'Organization',
      name: 'Touchless Car Wash Finder',
      url: SITE_URL,
    },
    areaServed: 'United States',
    url: `${SITE_URL}${PAGE_PATH}`,
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is an unlimited touchless car wash subscription?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'An unlimited wash club is a monthly subscription that lets you visit a car wash as many times as you want for a flat monthly fee. On touchless plans, every wash is brushless — only high-pressure water and soap touch the vehicle — so there is no risk of swirl marks, scratches, or micro-abrasions to your paint.',
        },
      },
      {
        '@type': 'Question',
        name: 'How much does an unlimited touchless car wash membership cost?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Monthly unlimited touchless plans typically range from $20 to $50 per month in 2026, depending on the chain, wash tier, and region. Most chains offer 2–3 tiers, with the top tier adding ceramic sealant, tire shine, or rain protection on top of the base touchless wash.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is unlimited worth it if I only wash my car a few times a month?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'As a rule of thumb, if a single top-tier touchless wash costs $15–$20, two washes a month usually pays for a basic unlimited plan. Three or more washes a month almost always beats paying per-wash — and many drivers wash weekly once they have unlimited.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I use my unlimited membership at any location?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Most chains let you use your unlimited plan at any of their locations in the same region or state. A few (like Splash and Prestige) treat their membership as all-access across every site in the chain. Always confirm with the specific chain before signing up — a Delta Sonic plan, for example, does not work at a Drive & Shine.',
        },
      },
      {
        '@type': 'Question',
        name: 'How do I cancel an unlimited car wash subscription?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Most chains let you cancel at any time, either through their app, website, or in person at the pay station. Cancellation is typically effective at the end of your current billing cycle — you keep access through the month you already paid for.',
        },
      },
    ],
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Hero */}
      <div className="bg-[#0F2744] relative overflow-hidden">
        <div className="relative container mx-auto px-4 max-w-6xl py-12 md:py-16">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">Unlimited Touchless Car Wash</span>
          </nav>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Unlimited Touchless Car Wash Subscriptions
          </h1>
          <p className="text-lg text-blue-100 max-w-3xl">
            Monthly unlimited plans at {totalLocations.toLocaleString()}+ brushless car wash locations across {totalStateSet.size} states. Pay once, wash every day — no brushes, no scratches, no per-wash fees.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-8">
        {/* Intro */}
        <div className="bg-blue-50 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-bold text-[#0F2744] mb-3 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            How unlimited touchless car wash clubs work
          </h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            An unlimited wash club is exactly what it sounds like: a flat monthly fee that lets you visit your chain&rsquo;s car wash as many times as you want. Plans auto-renew each month and are cancel-anytime. Most chains offer 2&ndash;3 tiers — a basic unlimited touchless wash at the bottom, and a top-tier plan that adds ceramic sealant, rain protection, or tire shine.
          </p>
          <p className="text-gray-700 leading-relaxed">
            On a <strong>touchless</strong> subscription, every wash is brushless — only high-pressure water and soap touch your vehicle. That&rsquo;s the difference from a typical tunnel unlimited plan: zero contact means zero swirl marks, zero micro-abrasions, and zero risk to ceramic coatings or delicate finishes.
          </p>
        </div>

        {/* Why choose touchless unlimited */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-4">Why choose a touchless unlimited plan over a tunnel plan?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 font-semibold text-[#0F2744] mb-2">
                  <Check className="w-5 h-5 text-green-600" /> Paint protection
                </div>
                <p className="text-sm text-gray-700">No cloth, no foam, no friction. Your clear coat never touches an abrasive surface, so there&rsquo;s nothing to scratch or dull finish or ceramic coating.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 font-semibold text-[#0F2744] mb-2">
                  <Check className="w-5 h-5 text-green-600" /> Fit the car to the wash
                </div>
                <p className="text-sm text-gray-700">Touchless in-bay automatics handle oversized mirrors, roof racks, spoilers, lifted trucks, and aftermarket accessories that tunnels won&rsquo;t allow.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 font-semibold text-[#0F2744] mb-2">
                  <Check className="w-5 h-5 text-green-600" /> 24/7 access at many sites
                </div>
                <p className="text-sm text-gray-700">Unlike staffed tunnels, many touchless bays run 24 hours a day — your subscription works on the way home from the airport at 2am.</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Comparison table */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-4">Chains offering unlimited touchless subscriptions</h2>
          <p className="text-sm text-gray-600 mb-4">
            Ranked by total touchless locations. Click any chain to see every location on its unlimited plan.
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-[#0F2744] text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Chain</th>
                  <th className="px-4 py-3 text-left font-semibold">Plan Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Price</th>
                  <th className="px-4 py-3 text-right font-semibold">Locations</th>
                  <th className="px-4 py-3 text-left font-semibold">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {chains.map((c, idx) => (
                  <tr key={c.slug} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-100 hover:bg-blue-50 transition-colors`}>
                    <td className="px-4 py-3">
                      <Link href={`/chain/${c.slug}`} className="text-blue-600 hover:underline font-medium">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{c.planName ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700 font-medium">{c.priceLabel}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{c.count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.states.length <= 3 ? c.states.join(', ') : `${c.states.slice(0, 3).join(', ')} +${c.states.length - 3}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-2 italic">Pricing ranges reflect publicly published monthly rates and may vary by location. Always confirm with the chain before signing up.</p>
        </div>

        {/* Pricing guide */}
        <div className="mb-10 bg-gray-50 rounded-xl p-6">
          <h2 className="text-2xl font-bold text-foreground mb-4">What does a touchless unlimited plan cost in {year}?</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Most touchless unlimited memberships fall into three price bands in {year}:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-3">
            <li><strong>Basic unlimited touchless</strong> — typically <strong>$20&ndash;$25/mo</strong>. Gets you unlimited brushless washes at the entry tier, usually with free vacuums included at the location.</li>
            <li><strong>Mid-tier (most popular)</strong> — typically <strong>$30&ndash;$35/mo</strong>. Adds rain protectant, tire shine, and a stronger pre-soak. This is the sweet spot for most drivers.</li>
            <li><strong>Top-tier (ceramic / premium)</strong> — typically <strong>$40&ndash;$50/mo</strong>. Adds ceramic sealant, graphene, or clear-coat sealant — effectively maintaining a light protective layer between detailing sessions.</li>
          </ul>
          <p className="text-sm text-gray-600 italic">
            Exact pricing varies by chain and region. Some chains (Splash, Delta Sonic) offer multi-vehicle family plans at a discount. Nearly all chains let you cancel anytime with no fee.
          </p>
        </div>

        {/* Mid-content product spotlight */}
        <div className="mb-10">
          <ProductSpotlight
            productId="meguiars-hybrid-ceramic-wax"
            eyebrow="Make Each Wash Last Longer"
          />
        </div>

        {/* Is it worth it */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-4">Is an unlimited touchless subscription worth it?</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            The break-even math is simple: if a single top-tier touchless wash costs $15&ndash;$20, then <strong>two washes a month covers a basic unlimited plan</strong>. Three washes a month beats mid-tier. Most drivers who subscribe end up washing weekly once the per-wash cost drops to zero.
          </p>
          <p className="text-gray-700 leading-relaxed">
            Touchless unlimited is especially worth it in salt-belt states (northern tier winters), coastal states (road salt plus sea spray), and anywhere with seasonal pollen or road construction — frequent washes actively extend the life of your paint and undercarriage when there&rsquo;s no friction damage from the wash itself.
          </p>
        </div>

        {/* FAQ */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-4">Frequently asked questions</h2>
          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-[#0F2744] mb-2">Can I use my unlimited membership at any location?</h3>
              <p className="text-gray-700 text-sm leading-relaxed">Most chains let you use your unlimited plan at any of their locations in the same region or state. A few (like Splash and Prestige) treat their membership as all-access across every site in the chain. Always confirm with the specific chain before signing up — a Delta Sonic plan, for example, does not work at a Drive &amp; Shine.</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-[#0F2744] mb-2">How do I cancel?</h3>
              <p className="text-gray-700 text-sm leading-relaxed">Most chains let you cancel at any time — through their app, website, or in person at the pay station. Cancellation is typically effective at the end of your current billing cycle, so you keep access through the month you already paid for.</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-[#0F2744] mb-2">Do these plans include interior cleaning?</h3>
              <p className="text-gray-700 text-sm leading-relaxed">No. Unlimited touchless plans cover the exterior wash only. Most chains offer free self-serve vacuums at the location (included with the wash, not the membership), and a few (Drive &amp; Shine, Delta Sonic) offer add-on detailing services separately.</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-[#0F2744] mb-2">Is touchless really safer for my paint than a tunnel?</h3>
              <p className="text-gray-700 text-sm leading-relaxed">Yes, especially for new paint, ceramic coatings, matte finishes, or cars you plan to keep long-term. Soft-touch tunnel cloth picks up grit from earlier cars and can cause swirl marks over many washes. Touchless eliminates that risk entirely — the only thing that ever touches your vehicle is water and soap.</p>
            </div>
          </div>
        </div>

        {/* Browse by state */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-2">Find unlimited touchless plans by state</h2>
          <p className="text-gray-600 text-sm mb-5">
            Select your state to see every location with a monthly membership or unlimited plan.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {US_STATES.filter(s => totalStateSet.has(s.code)).map(s => (
              <Link
                key={s.code}
                href={`/unlimited-touchless-car-wash/${getStateSlug(s.code)}`}
                className="group block bg-white border border-gray-200 rounded-xl p-3 text-center hover:border-blue-400 hover:shadow-md transition-all"
              >
                <div className="text-xl font-bold text-[#0F2744] mb-0.5 group-hover:text-blue-600 transition-colors">{s.code}</div>
                <div className="text-xs text-gray-600">{getStateName(s.code)}</div>
              </Link>
            ))}
          </div>
        </div>

        {/* Affiliate Products — between-wash care for subscribers */}
        <div className="mb-10">
          <ProductGrid
            preset="unlimited"
            variant="card"
            bg="gray"
            subtitle="Already washing weekly with your unlimited plan? These extend the results between visits."
          />
        </div>

        {/* CTA */}
        <div className="mt-12 p-6 bg-[#0F2744] rounded-2xl text-center">
          <p className="text-white font-semibold text-lg mb-2">Find a touchless unlimited plan near you</p>
          <p className="text-white/70 text-sm mb-4">
            Browse our directory of {totalLocations.toLocaleString()}+ verified touchless locations across {totalStateSet.size} states. Every listing is confirmed brushless.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button asChild className="bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold">
              <Link href="/states">Browse by state</Link>
            </Button>
            <Button asChild variant="outline" className="bg-white text-[#0F2744] hover:bg-gray-100">
              <Link href="/chains">All touchless chains</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
