import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Trophy, MapPin, Star, ChevronRight, Award } from 'lucide-react';
import {
  getRegionBySlug,
  getRegionalChainRankings,
  CHAIN_REGIONS,
  AWARDS,
  type ChainRegionSlug,
  type RankedChain,
  type AwardCategory,
} from '@/lib/chain-rankings';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const YEAR = 2026;

interface Props {
  params: { region: string };
}

export function generateStaticParams() {
  return CHAIN_REGIONS.map(r => ({ region: r.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const region = getRegionBySlug(params.region);
  if (!region) return { title: 'Not Found' };
  return {
    title: `Best Touchless Car Wash Chains in the ${region.name} — ${YEAR} Rankings`,
    description: `The top-ranked touchless car wash chains in the ${region.name} — ranked by location count, Google ratings, and state coverage. ${YEAR} edition with verified data.`,
    alternates: { canonical: `${SITE_URL}/best/chains/${region.slug}` },
    openGraph: {
      title: `Best Touchless Car Wash Chains — ${region.name} ${YEAR}`,
      description: `Top touchless car wash chains in the ${region.name} ranked by locations, ratings, and coverage.`,
      url: `${SITE_URL}/best/chains/${region.slug}`,
      siteName: 'Touchless Car Wash Finder',
      type: 'website',
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-1">
      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
      <span className="text-sm font-semibold text-gray-800">{rating.toFixed(1)}</span>
    </span>
  );
}

function AwardBadge({ category }: { category: AwardCategory }) {
  const award = AWARDS[category];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${award.color} ${award.textColor}`}>
      {award.emoji} {award.label}
    </span>
  );
}

function ChainCard({ chain, rank }: { chain: RankedChain; rank: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-blue-200 transition-all">
      <div className="relative h-36 bg-gradient-to-br from-[#0F2744] to-[#1a3a5c] overflow-hidden">
        {chain.heroImage ? (
          <img src={chain.heroImage} alt={chain.name} className="w-full h-full object-cover opacity-80" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl font-black text-white/20">{chain.name.charAt(0)}</span>
          </div>
        )}
        <div className="absolute top-3 left-3 w-8 h-8 rounded-full bg-white/95 flex items-center justify-center shadow">
          <span className="text-sm font-black text-[#0F2744]">#{rank}</span>
        </div>
        {chain.awards.length > 0 && (
          <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
            {chain.awards.map(a => <AwardBadge key={a} category={a} />)}
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
          {chain.statesPresent.map(s => (
            <span key={s} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{s}</span>
          ))}
        </div>
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{chain.description}</p>
        <Link
          href={`/chain/${chain.slug}`}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          View all locations <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

function BadgeEmbedSection({ chains, regionSlug }: { chains: RankedChain[]; regionSlug: string }) {
  const awardWinners = chains.filter(c => c.awards.length > 0);
  if (awardWinners.length === 0) return null;

  const entries: { chain: RankedChain; awardCategory: AwardCategory }[] = [];
  for (const chain of awardWinners) {
    for (const awardCategory of chain.awards) {
      entries.push({ chain, awardCategory });
    }
  }

  return (
    <section className="mt-16 pt-12 border-t border-gray-200">
      <div className="flex items-center gap-3 mb-2">
        <Award className="w-6 h-6 text-[#22C55E]" />
        <h2 className="text-2xl font-bold text-gray-900">Claim Your Award Badge</h2>
      </div>
      <p className="text-gray-600 mb-8 max-w-2xl">
        Are you one of the chains featured above? Display your {YEAR} award badge on your website — free to use, links back to your ranking.
      </p>
      <div className="grid sm:grid-cols-2 gap-6">
        {entries.map(({ chain, awardCategory }) => {
          const award = AWARDS[awardCategory];
          const badgeUrl = `${SITE_URL}/badges/${awardCategory}-${YEAR}.svg`;
          const linkUrl = `${SITE_URL}/best/chains/${regionSlug}`;
          const embedCode = `<a href="${linkUrl}" title="${chain.name} — ${award.label} ${YEAR} | Touchless Car Wash Finder">\n  <img src="${badgeUrl}" alt="${chain.name} — ${award.label} ${YEAR}" width="240" height="100">\n</a>`;
          return (
            <div key={`${chain.name}-${awardCategory}`} className="bg-gray-50 border border-gray-200 rounded-xl p-5">
              <div className="flex items-start gap-4 mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={badgeUrl} alt={`${award.label} badge`} width={160} height={67} className="rounded flex-shrink-0" />
                <div>
                  <p className="font-bold text-gray-900">{chain.name}</p>
                  <p className="text-sm text-gray-600">{award.emoji} {award.label} — {YEAR}</p>
                  <p className="text-xs text-gray-500 mt-1">{award.description}</p>
                </div>
              </div>
              <p className="text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Embed Code</p>
              <pre className="text-xs bg-white border border-gray-200 rounded p-3 overflow-x-auto text-gray-600 whitespace-pre-wrap break-all">{embedCode}</pre>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function RegionalChainRankingsPage({ params }: Props) {
  const region = getRegionBySlug(params.region);
  if (!region) notFound();

  const chains = await getRegionalChainRankings(params.region as ChainRegionSlug);
  const otherRegions = CHAIN_REGIONS.filter(r => r.slug !== region.slug);
  const totalLocations = chains.reduce((s, c) => s + c.locationCount, 0);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Best Of', item: `${SITE_URL}/best` },
      { '@type': 'ListItem', position: 3, name: 'Chain Rankings', item: `${SITE_URL}/best/chains` },
      { '@type': 'ListItem', position: 4, name: region.name, item: `${SITE_URL}/best/chains/${region.slug}` },
    ],
  };

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Best Touchless Car Wash Chains in the ${region.name} ${YEAR}`,
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
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-6 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/best" className="hover:text-white transition-colors">Best Of</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/best/chains" className="hover:text-white transition-colors">Chain Rankings</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">{region.name}</span>
          </nav>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-xl bg-yellow-400/20 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-yellow-400" />
            </div>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Best Touchless Car Wash Chains in the {region.name} — {YEAR}
          </h1>
          <p className="text-lg text-blue-100 max-w-2xl">{region.tagline}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-5xl py-10">

        {/* Region description */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 mb-10">
          <p className="text-gray-700 leading-relaxed">{region.description}</p>
          <p className="text-sm text-gray-500 mt-3">
            Ranked by verified location count across {region.states.join(', ')}. Ratings from Google Reviews via our live directory of {totalLocations}+ touchless locations in this region.
          </p>
        </div>

        {chains.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No qualifying chains found for this region yet.</p>
            <Link href="/best/chains" className="text-blue-600 hover:underline mt-2 block">View national rankings →</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {chains.map((chain, i) => (
              <ChainCard key={chain.slug} chain={chain} rank={i + 1} />
            ))}
          </div>
        )}

        {/* Award legend */}
        {chains.some(c => c.awards.length > 0) && (
          <div className="mt-8 p-5 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-sm font-semibold text-gray-700 mb-3">Award Categories</p>
            <div className="flex flex-wrap gap-3">
              {Object.values(AWARDS).map(award => (
                <span key={award.category} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${award.color} ${award.textColor}`}>
                  {award.emoji} <strong>{award.label}</strong> — {award.description}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Badge embed section */}
        <BadgeEmbedSection chains={chains} regionSlug={region.slug} />

        {/* Other regions */}
        <section className="mt-16 pt-12 border-t border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-5">Rankings in Other Regions</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {otherRegions.map(r => (
              <Link
                key={r.slug}
                href={`/best/chains/${r.slug}`}
                className="group flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:border-[#22C55E] hover:shadow-sm transition-all"
              >
                <p className="font-semibold text-gray-800 text-sm group-hover:text-[#22C55E] transition-colors">{r.name}</p>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#22C55E] transition-colors" />
              </Link>
            ))}
            <Link
              href="/best/chains"
              className="group flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:border-[#22C55E] hover:shadow-sm transition-all"
            >
              <p className="font-semibold text-gray-800 text-sm group-hover:text-[#22C55E] transition-colors">National Top 10</p>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#22C55E] transition-colors" />
            </Link>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-12 bg-[#0F2744] rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Find a Touchless Car Wash Near You</h2>
          <p className="text-blue-200 mb-6 max-w-xl mx-auto">
            Browse all {totalLocations.toLocaleString()}+ verified touchless locations in the {region.name} — with ratings, hours, and directions.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {region.states.slice(0, 6).map(state => (
              <Link
                key={state}
                href={`/state/${state.toLowerCase() === 'dc' ? 'district-of-columbia' : ''}`}
                className="bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {state}
              </Link>
            ))}
            <Link
              href="/states"
              className="bg-[#22C55E] hover:bg-[#16A34A] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              All States →
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
