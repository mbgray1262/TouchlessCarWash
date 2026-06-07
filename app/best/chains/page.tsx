import Link from 'next/link';
import { Trophy, MapPin, Star, ChevronRight, Award } from 'lucide-react';
import { getNationalChainRankings, CHAIN_REGIONS, CHAIN_LABELS, type RankedChain, type LabelCategory } from '@/lib/chain-rankings';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 3600; // ISR: edge-cache full-body response (replaces force-dynamic no-store bypass that caused slow TTFB); 304-bug-safe, validated on /best canary

const SITE_URL = 'https://touchlesscarwashfinder.com';
const YEAR = 2026;

export const metadata: Metadata = {
  title: `Top 10 Touchless Car Wash Chains in America — ${YEAR} Rankings`,
  description: `The best touchless car wash chains in the US ranked by location count, Google ratings, and regional coverage. ${YEAR} edition with verified data from our national directory.`,
  alternates: { canonical: `${SITE_URL}/best/chains` },
  openGraph: {
    title: `Top 10 Touchless Car Wash Chains in America — ${YEAR}`,
    description: `The best touchless car wash chains in the US ranked by location count, ratings, and coverage. ${YEAR} edition.`,
    url: `${SITE_URL}/best/chains`,
    siteName: 'Touchless Car Wash Finder',
    type: 'website',
    images: [DEFAULT_OG_IMAGE],
  },
};

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-1">
      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
      <span className="text-sm font-semibold text-gray-800">{rating.toFixed(1)}</span>
    </span>
  );
}

function LabelChip({ category }: { category: LabelCategory }) {
  const lbl = CHAIN_LABELS[category];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${lbl.color} ${lbl.textColor}`}>
      {lbl.emoji} {lbl.label}
    </span>
  );
}

function ChainCard({ chain, rank }: { chain: RankedChain; rank: number }) {
  const canClaimBadge = rank <= 3;
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-blue-200 transition-all">
      {/* Image or placeholder */}
      <div className="relative h-36 bg-gradient-to-br from-[#0F2744] to-[#1a3a5c] overflow-hidden">
        {chain.heroImage ? (
          <img src={chain.heroImage} alt={chain.name} className="w-full h-full object-cover opacity-80" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl font-black text-white/20">{chain.name.charAt(0)}</span>
          </div>
        )}
        {/* Rank badge */}
        <div className="absolute top-3 left-3 w-8 h-8 rounded-full bg-white/95 flex items-center justify-center shadow">
          <span className="text-sm font-black text-[#0F2744]">#{rank}</span>
        </div>
        {/* Informational label chip */}
        {chain.labels.length > 0 && (
          <div className="absolute top-3 right-3">
            <LabelChip category={chain.labels[0]} />
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="text-base font-bold text-gray-900 mb-2">{chain.name}</h3>

        <div className="flex flex-wrap items-center gap-3 mb-3 text-sm text-gray-600">
          <span className="flex items-center gap-1 font-semibold text-[#0F2744]">
            <MapPin className="w-3.5 h-3.5 text-[#22C55E]" />
            {chain.locationCount} locations
          </span>
          {chain.avgRating && <StarRating rating={chain.avgRating} />}
          {chain.totalReviews > 0 && (
            <span className="text-gray-400 text-xs">{chain.totalReviews.toLocaleString()} reviews</span>
          )}
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {chain.statesPresent.slice(0, 8).map(s => (
            <span key={s} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{s}</span>
          ))}
          {chain.statesPresent.length > 8 && (
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">+{chain.statesPresent.length - 8} more</span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <Link
            href={`/chain/${chain.slug}`}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            View all locations <ChevronRight className="w-3.5 h-3.5" />
          </Link>
          {canClaimBadge && (
            <Link
              href={`/badge/chain/${chain.slug}`}
              className="text-xs font-semibold text-yellow-700 bg-yellow-50 border border-yellow-200 hover:bg-yellow-100 px-2 py-1 rounded-full flex items-center gap-1 transition-colors"
            >
              <Trophy className="w-3 h-3" /> Claim Badge
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function BadgeClaimSection({ chains }: { chains: RankedChain[] }) {
  const top3 = chains.slice(0, 3);
  return (
    <section className="mt-16 pt-12 border-t border-gray-200">
      <div className="flex items-center gap-3 mb-2">
        <Award className="w-6 h-6 text-[#22C55E]" />
        <h2 className="text-2xl font-bold text-gray-900">Claim Your Award Badge</h2>
      </div>
      <p className="text-gray-600 mb-8 max-w-2xl">
        Are you ranked in the top 3? Display your {YEAR} ranking badge on your website — free, with a live preview and one-click embed code.
      </p>
      <div className="grid sm:grid-cols-3 gap-4">
        {top3.map((chain, i) => (
          <Link
            key={chain.slug}
            href={`/badge/chain/${chain.slug}`}
            className="group flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl hover:border-yellow-300 hover:bg-yellow-50 transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-sm font-black text-[#0F2744]">#{i + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate group-hover:text-yellow-800">{chain.name}</p>
              <p className="text-xs text-gray-500">Claim badge →</p>
            </div>
            <Trophy className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function NationalChainRankingsPage() {
  const chains = await getNationalChainRankings();

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Best Of', item: `${SITE_URL}/best` },
      { '@type': 'ListItem', position: 3, name: 'Chain Rankings', item: `${SITE_URL}/best/chains` },
    ],
  };

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Top Touchless Car Wash Chains in America ${YEAR}`,
    itemListElement: chains.map((chain, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: chain.name,
      url: `${SITE_URL}/chain/${chain.slug}`,
    })),
  };

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />

      {/* Hero */}
      <div className="bg-[#0F2744] py-14 md:py-20">
        <div className="container mx-auto px-4 max-w-5xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-6">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/best" className="hover:text-white transition-colors">Best Of</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">Chain Rankings</span>
          </nav>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-xl bg-yellow-400/20 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-yellow-400" />
            </div>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Top 10 Touchless Car Wash Chains in America — {YEAR}
          </h1>
          <p className="text-lg text-blue-100 max-w-2xl">
            Ranked by verified location count, Google ratings, and geographic coverage. Based on live data from our national directory of {chains.reduce((s, c) => s + c.locationCount, 0).toLocaleString()}+ verified touchless locations.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-5xl py-10">

        {/* Intro */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 mb-10">
          <p className="text-gray-700 leading-relaxed">
            Not all car wash chains are touchless — many popular brands use soft-touch brushes or tunnel conveyors that make contact with your vehicle. The chains below have been verified to operate automatic touchless (in-bay) car wash systems: high-pressure water jets and detergents, no brush contact. Rankings reflect verified location counts from our live directory.
          </p>
        </div>

        {/* Rankings grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
          {chains.map((chain, i) => (
            <ChainCard key={chain.slug} chain={chain} rank={i + 1} />
          ))}
        </div>

        {/* Regional rankings nav */}
        <section className="mt-14 pt-10 border-t border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Rankings by Region</h2>
          <p className="text-gray-600 mb-6">See which chains dominate each part of the country.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CHAIN_REGIONS.map(region => (
              <Link
                key={region.slug}
                href={`/best/chains/${region.slug}`}
                className="group flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:border-[#22C55E] hover:shadow-md transition-all"
              >
                <div>
                  <p className="font-bold text-gray-900 group-hover:text-[#22C55E] transition-colors">{region.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{region.states.length} states</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-[#22C55E] transition-colors" />
              </Link>
            ))}
          </div>
        </section>

        {/* Badge claim section — top 3 can claim positional badges */}
        <BadgeClaimSection chains={chains} />

        {/* CTA */}
        <section className="mt-16 bg-[#0F2744] rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Find a Touchless Car Wash Near You</h2>
          <p className="text-blue-200 mb-6 max-w-xl mx-auto">
            Browse {chains.reduce((s, c) => s + c.locationCount, 0).toLocaleString()}+ verified chain locations plus thousands of independent touchless washes across all 50 states.
          </p>
          <Link
            href="/states"
            className="inline-block bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-8 py-3 rounded-lg transition-colors"
          >
            Find Locations by State
          </Link>
        </section>

      </div>
    </div>
  );
}
