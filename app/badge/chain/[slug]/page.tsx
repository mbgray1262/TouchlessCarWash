import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Trophy, MapPin, ArrowLeft, Star } from 'lucide-react';
import { getChainBadgeClaims, getNationalChainRankings } from '@/lib/chain-rankings';
import { getChainBySlug } from '@/lib/chains';
import { ChainBadgeClaimClient } from '@/components/ChainBadgeClaimClient';
import type { Metadata } from 'next';

const SITE_URL = 'https://touchlesscarwashfinder.com';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const chain = getChainBySlug(slug);
  if (!chain) return { title: 'Badge Not Found' };

  const claims = await getChainBadgeClaims(slug);
  // Allow page for national top-10 (consolation) AND regional top-3
  const hasAnyClaim = claims.national !== null || claims.nationalRank !== null || claims.regional.length > 0;
  if (!hasAnyClaim) return { title: 'Badge Not Found' };

  const topClaim = claims.national ?? claims.regional[0];
  const rankLabel = topClaim
    ? (topClaim.rank <= 3
        ? (topClaim.rank === 1 ? '1st' : topClaim.rank === 2 ? '2nd' : '3rd')
        : 'Top 10')
    : (claims.nationalRank ? 'Top 10' : '');
  const scopeName = topClaim ? topClaim.scopeName : 'America';
  const title = `${chain.name} — ${rankLabel} Best Touchless Car Wash Chain in ${scopeName} | Claim Your Badge`;
  const description = `${chain.name} is ranked ${rankLabel} Best Touchless Car Wash Chain in ${scopeName}. Claim your free award badge and display it on your website.`;

  return {
    title,
    description,
    // noindex: "claim your badge" conversion page for the chain owner, not
    // search content — it duplicates the rankings already covered by the
    // indexable /best/chains and /best/chains/<region> pages. Kept out of the
    // index (and the sitemap) so it doesn't compete with those canonical
    // ranking pages. follow:true so its outbound links still pass equity.
    robots: { index: false, follow: true },
    alternates: { canonical: `${SITE_URL}/badge/chain/${slug}` },
    openGraph: { title, description, url: `${SITE_URL}/badge/chain/${slug}`, type: 'website' },
  };
}

function ordinalLabel(rank: number) {
  return rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd';
}

export default async function ChainBadgeClaimPage({ params }: Props) {
  const { slug } = await params;
  const chain = getChainBySlug(slug);
  if (!chain) notFound();

  const [claims, nationalChains] = await Promise.all([
    getChainBadgeClaims(slug),
    getNationalChainRankings(),
  ]);

  // Allow page for: national top-3, national top-10 consolation, or regional top-3
  const hasAnyClaim = claims.national !== null || claims.nationalRank !== null || claims.regional.length > 0;
  if (!hasAnyClaim) notFound();

  const ranked = nationalChains.find(c => c.slug === slug);
  const chainUrl = `${SITE_URL}/chain/${slug}`;
  const year = new Date().getFullYear();

  // Top-3 claims get positional badge sections (national first, then regional)
  const positionalClaims = [
    ...(claims.national ? [{ ...claims.national, scopeParam: 'national', isNational: true }] : []),
    ...claims.regional.map(r => ({ ...r, scopeParam: r.regionSlug, isNational: false })),
  ];

  // National Top 10 consolation (rank 4–10, not already covered by national top-3)
  const hasTop10Consolation = claims.nationalRank !== null && claims.nationalRank > 3 && claims.nationalRank <= 10;

  const topDisplay = positionalClaims[0] ?? (hasTop10Consolation
    ? { rank: claims.nationalRank!, scopeName: 'America', isNational: true }
    : null);

  if (!topDisplay) notFound();

  return (
    <main className="min-h-screen bg-white">

      {/* Hero */}
      <section className="bg-[#0F2744] text-white py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-yellow-400/20 mb-6">
            <Trophy className="w-10 h-10 text-yellow-400" />
          </div>
          <p className="text-blue-200/70 text-sm font-medium uppercase tracking-widest mb-2">
            Claim Your Badge
          </p>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Congratulations, {chain.name}!
          </h1>
          <p className="text-xl text-blue-100 mb-6">
            {topDisplay.rank <= 3 ? (
              <>
                You&apos;re ranked{' '}
                <span className="font-bold text-yellow-400">#{topDisplay.rank}</span>{' '}
                Best Touchless Car Wash Chain in{' '}
                <span className="font-bold text-white">{topDisplay.scopeName}</span>
              </>
            ) : (
              <>
                You&apos;re in the{' '}
                <span className="font-bold text-yellow-400">Top 10</span>{' '}
                Best Touchless Car Wash Chains in{' '}
                <span className="font-bold text-white">America</span>
              </>
            )}
          </p>

          {/* All top-3 ranking positions */}
          {positionalClaims.length > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {positionalClaims.map(claim => (
                <Link
                  key={claim.scopeUrl}
                  href={claim.scopeUrl}
                  className="inline-flex items-center gap-1 bg-white/10 hover:bg-white/20 rounded-full px-3 py-1 text-sm transition-colors"
                >
                  <Trophy className="w-3 h-3 text-yellow-400" />
                  #{claim.rank} in {claim.scopeName}
                </Link>
              ))}
            </div>
          )}

          {/* Chain stats */}
          {ranked && (
            <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
              <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
                <MapPin className="w-4 h-4 text-[#22C55E]" />
                <span className="text-sm font-semibold">{ranked.locationCount} verified locations</span>
              </div>
              {ranked.avgRating && (
                <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  <span className="text-sm font-semibold">{ranked.avgRating.toFixed(1)} avg rating</span>
                </div>
              )}
              <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
                <span className="text-sm font-semibold">{ranked.statesPresent.length} states</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* One badge section per positional claim (#1/#2/#3) */}
      {positionalClaims.map((claim, i) => (
        <section key={claim.scopeUrl} className={`py-14 px-4 ${i % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}>
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold text-[#0F2744] mb-1">
              {ordinalLabel(claim.rank)} in {claim.scopeName}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              <Link href={claim.scopeUrl} className="text-blue-600 hover:underline">
                {claim.isNational ? 'National Chain Rankings' : `${claim.scopeName} Regional Rankings`}
              </Link>
            </p>
            <ChainBadgeClaimClient
              rank={claim.rank}
              scopeName={claim.scopeName}
              scopeParam={claim.scopeParam}
              chainSlug={slug}
              chainUrl={chainUrl}
              chainName={chain.name}
              year={year}
            />
          </div>
        </section>
      ))}

      {/* Top 10 consolation badge section (rank 4–10, national only) */}
      {hasTop10Consolation && (
        <section className={`py-14 px-4 ${positionalClaims.length % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}>
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold text-[#0F2744] mb-1">
              Top 10 in America
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              <Link href={`${SITE_URL}/best/chains`} className="text-blue-600 hover:underline">
                National Chain Rankings
              </Link>
            </p>
            <ChainBadgeClaimClient
              rank={claims.nationalRank!}
              scopeName="America"
              scopeParam="national"
              chainSlug={slug}
              chainUrl={chainUrl}
              chainName={chain.name}
              year={year}
            />
          </div>
        </section>
      )}

      {/* Why display */}
      <section className="py-14 px-4 bg-[#0F2744]">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-white mb-6">Why Display This Badge?</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: <Trophy className="w-6 h-6 text-yellow-600" />, bg: 'bg-yellow-100', title: 'Build Trust', body: 'Show customers you\'re independently ranked among America\'s top touchless car wash chains.' },
              { icon: <Star className="w-6 h-6 text-green-600" />, bg: 'bg-green-100', title: 'Stand Out', body: 'Differentiate your brand with a verified third-party ranking on your website and marketing materials.' },
              { icon: <MapPin className="w-6 h-6 text-blue-600" />, bg: 'bg-blue-100', title: 'Drive Traffic', body: 'The badge links to your chain\'s directory page where customers can find all your locations.' },
            ].map(item => (
              <div key={item.title} className="text-center p-6 rounded-xl bg-white/5">
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${item.bg} mb-4`}>
                  {item.icon}
                </div>
                <h3 className="font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-blue-200">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Back link */}
      <section className="py-10 px-4 bg-white">
        <div className="container mx-auto max-w-3xl text-center">
          <Link
            href="/best/chains"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-[#22C55E] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            View all chain rankings
          </Link>
        </div>
      </section>

    </main>
  );
}
