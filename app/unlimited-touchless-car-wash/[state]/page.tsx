import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Check, Sparkles } from 'lucide-react';
import { ListingCard } from '@/components/ListingCard';
import { supabase, LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { US_STATES, getStateName, getStateSlug, slugify } from '@/lib/constants';
import { CHAINS } from '@/lib/chains';
import { getChainSubscriptionDisplay } from '@/lib/chain-subscriptions';
import { UNLIMITED_CHAIN_SLUGS, hasSubscription } from '@/lib/state-hub-filters';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 3600;

const SITE_URL = 'https://touchlesscarwashfinder.com';

function getStateCode(slug: string): string | null {
  const s = US_STATES.find(s => slugify(s.name) === slug);
  return s ? s.code : null;
}

export function generateStaticParams() {
  return US_STATES.map(s => ({ state: getStateSlug(s.code) }));
}

/** Fetch all listings for a state, paginating past the 1000-row cap. */
async function getAllStateListings(stateCode: string): Promise<Listing[]> {
  const all: Listing[] = [];
  const BATCH = 1000;
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('listings')
      .select(LISTING_CARD_COLUMNS)
      .eq('is_touchless', true)
      .eq('is_approved', true)
      .eq('state', stateCode)
      .range(offset, offset + BATCH - 1);
    if (!data || data.length === 0) break;
    all.push(...(data as Listing[]));
    if (data.length < BATCH) break;
    offset += BATCH;
  }
  return all;
}

export async function generateMetadata({
  params,
}: {
  params: { state: string };
}): Promise<Metadata> {
  const stateCode = getStateCode(params.state);
  if (!stateCode) return { title: 'Not Found' };
  const stateName = getStateName(stateCode);
  const year = new Date().getFullYear();
  const title = `Unlimited Touchless Car Wash in ${stateName} — Monthly Memberships (${year})`;
  const description = `Find touchless car wash unlimited subscription plans in ${stateName}. Monthly memberships at brushless, scratch-free locations — wash as often as you want for one flat price.`;
  const canonical = `${SITE_URL}/unlimited-touchless-car-wash/${params.state}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Touchless Car Wash Finder',
      type: 'website',
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function UnlimitedStatePage({
  params,
}: {
  params: { state: string };
}) {
  const stateCode = getStateCode(params.state);
  if (!stateCode) notFound();
  const stateName = getStateName(stateCode);
  const year = new Date().getFullYear();

  const allListings = await getAllStateListings(stateCode);
  const subListings = allListings.filter(hasSubscription);

  if (subListings.length === 0) notFound();

  // Which chains are represented in this state?
  const chainsInState = CHAINS.filter(c => {
    if (!UNLIMITED_CHAIN_SLUGS.has(c.slug)) return false;
    return subListings.some(l => l.parent_chain === c.name);
  });

  // Group by city for the count summary
  const cityCount: Record<string, number> = {};
  for (const l of subListings) {
    cityCount[l.city] = (cityCount[l.city] ?? 0) + 1;
  }
  const topCities = Object.entries(cityCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([city]) => city);

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Unlimited Touchless Car Wash', item: `${SITE_URL}/unlimited-touchless-car-wash` },
      { '@type': 'ListItem', position: 3, name: stateName, item: `${SITE_URL}/unlimited-touchless-car-wash/${params.state}` },
    ],
  };

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      {/* Hero */}
      <div className="bg-[#0F2744]">
        <div className="container mx-auto px-4 max-w-6xl py-12 md:py-16">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/unlimited-touchless-car-wash" className="hover:text-white transition-colors">Unlimited Touchless Car Wash</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">{stateName}</span>
          </nav>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Unlimited Touchless Car Wash in {stateName}
          </h1>
          <p className="text-lg text-blue-100 max-w-3xl">
            {subListings.length}+ locations in {stateName} offer monthly unlimited touchless car wash memberships — brushless, scratch-free, cancel anytime.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-8">

        {/* What to know */}
        <div className="bg-blue-50 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-bold text-[#0F2744] mb-3 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            Touchless unlimited plans in {stateName} — what you get
          </h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Every location on this page uses high-pressure water and chemistry only — no brushes, no cloth, no foam pads that touch your vehicle. A monthly unlimited membership means you pay once and wash as often as you want, typically between <strong>$20–$50/month</strong> depending on the tier and chain.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {[
              { label: 'No brushes or cloth', detail: 'Zero contact with your paint' },
              { label: 'Cancel anytime', detail: 'No long-term commitments' },
              { label: 'Wash as often as you want', detail: 'One flat monthly price' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-gray-800">{item.label}</p>
                  <p className="text-xs text-gray-600">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chains in this state */}
        {chainsInState.length > 0 && (
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-foreground mb-4">
              Chains with unlimited touchless plans in {stateName}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {chainsInState.map(chain => {
                const sub = getChainSubscriptionDisplay(chain.slug);
                const count = subListings.filter(l => l.parent_chain === chain.name).length;
                return (
                  <div key={chain.slug} className="border border-gray-200 rounded-xl p-4 bg-white hover:border-blue-300 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <Link href={`/chain/${chain.slug}`} className="font-semibold text-blue-600 hover:underline">
                        {chain.name}
                      </Link>
                      <span className="text-xs text-gray-500">{count} location{count !== 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-sm text-gray-700">{sub?.priceLabel ?? 'Monthly plan available'}</p>
                    {sub?.planName && <p className="text-xs text-gray-500 mt-0.5">{sub.planName}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top cities summary */}
        {topCities.length > 0 && (
          <div className="mb-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-800">Top cities:</span>{' '}
              {topCities.map((city, i) => (
                <span key={city}>
                  <Link
                    href={`/state/${params.state}/${slugify(city)}`}
                    className="text-blue-600 hover:underline"
                  >
                    {city}
                  </Link>
                  {i < topCities.length - 1 ? ', ' : ''}
                </span>
              ))}
            </p>
          </div>
        )}

        {/* Listings grid */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {subListings.length} locations with unlimited touchless plans in {stateName}
          </h2>
          <p className="text-gray-600 text-sm mb-6">
            Sorted by rating. Click any listing for hours, directions, and amenity details.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subListings
              .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
              .map(listing => (
                <ListingCard key={listing.id} listing={listing} showVerifiedBadge />
              ))}
          </div>
        </div>

        {/* Pricing guide */}
        <div className="mb-10 bg-gray-50 rounded-xl p-6">
          <h2 className="text-2xl font-bold text-foreground mb-3">
            How much does a touchless unlimited plan cost in {stateName}?
          </h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Most {stateName} touchless unlimited plans fall into three tiers in {year}:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 text-sm">
            <li><strong>Basic unlimited</strong> — typically <strong>$20–$25/mo</strong>. Unlimited brushless washes at the entry tier, usually with free vacuums included.</li>
            <li><strong>Mid-tier (most popular)</strong> — typically <strong>$30–$35/mo</strong>. Adds rain protectant, tire shine, and a stronger pre-soak.</li>
            <li><strong>Top-tier / ceramic</strong> — typically <strong>$40–$50/mo</strong>. Adds ceramic or graphene sealant for long-term paint protection.</li>
          </ul>
          <p className="text-xs text-gray-500 italic mt-3">Pricing varies by chain and location. Always confirm before signing up.</p>
        </div>

        {/* FAQ */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-4">
            Frequently asked questions
          </h2>
          <div className="space-y-3">
            {[
              {
                q: `Is an unlimited touchless car wash plan worth it in ${stateName}?`,
                a: `Yes — if you wash more than twice a month, a basic unlimited plan ($20–$25) usually pays for itself. Three washes beats mid-tier. Most ${stateName} members end up washing weekly once the per-wash cost drops to zero.`,
              },
              {
                q: 'Can I use my membership at any location?',
                a: 'Most chains let you use your membership at any of their locations in-state. A few treat membership as all-access chain-wide. Always confirm with the specific chain — a Delta Sonic membership doesn\'t work at Drive & Shine, for example.',
              },
              {
                q: 'Are touchless unlimited plans safe for new cars and ceramic coatings?',
                a: 'Absolutely — touchless plans are the safest option for new paint and ceramic coatings. No brushes or cloth ever touch the vehicle, so there is zero risk of swirl marks or micro-abrasions that soft-touch tunnels can cause over time.',
              },
            ].map(({ q, a }) => (
              <div key={q} className="border border-gray-200 rounded-lg p-5 bg-white">
                <h3 className="font-semibold text-[#0F2744] mb-2 text-sm">{q}</h3>
                <p className="text-gray-700 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA / links */}
        <div className="mt-10 p-6 bg-[#0F2744] rounded-2xl text-center">
          <p className="text-white font-semibold text-lg mb-2">Looking for a specific city?</p>
          <p className="text-white/70 text-sm mb-4">
            Browse touchless car washes by city in {stateName}, or explore all unlimited plans nationwide.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href={`/state/${params.state}`}
              className="inline-flex items-center gap-1.5 bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              All {stateName} listings
            </Link>
            <Link
              href="/unlimited-touchless-car-wash"
              className="inline-flex items-center gap-1.5 bg-white text-[#0F2744] hover:bg-gray-100 font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              Compare all chains
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
