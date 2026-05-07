import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Trophy, MapPin, ArrowLeft, Star } from 'lucide-react';
import { getNationalChainRankings, AWARDS } from '@/lib/chain-rankings';
import { getChainBySlug } from '@/lib/chains';
import { ChainBadgeClaimClient } from '@/components/ChainBadgeClaimClient';
import type { Metadata } from 'next';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const YEAR = 2026;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const chain = getChainBySlug(slug);
  if (!chain) return { title: 'Badge Not Found' };

  const chains = await getNationalChainRankings();
  const ranked = chains.find(c => c.slug === slug);
  if (!ranked || ranked.awards.length === 0) return { title: 'Badge Not Found' };

  const award = AWARDS[ranked.awards[0]];
  const title = `${chain.name} — ${award.emoji} ${award.label} ${YEAR} | Claim Your Badge`;
  const description = `${chain.name} earned the ${award.label} award in the ${YEAR} Touchless Car Wash Chain Rankings. Claim your free award badge and display it on your website.`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/badge/chain/${slug}` },
    openGraph: { title, description, url: `${SITE_URL}/badge/chain/${slug}`, type: 'website' },
  };
}

export default async function ChainBadgeClaimPage({ params }: Props) {
  const { slug } = await params;
  const chain = getChainBySlug(slug);
  if (!chain) notFound();

  const chains = await getNationalChainRankings();
  const ranked = chains.find(c => c.slug === slug);
  if (!ranked || ranked.awards.length === 0) notFound();

  // Primary award drives the page headline; all awards get badge + embed code below
  const primaryAwardCategory = ranked.awards[0];
  const award = AWARDS[primaryAwardCategory];
  const badgeSvgUrl = `${SITE_URL}/badges/${primaryAwardCategory}-${YEAR}.svg`;
  const chainUrl = `${SITE_URL}/chain/${slug}`;

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
          <p className="text-xl text-blue-100 mb-4">
            You&apos;ve earned the{' '}
            <span className="font-bold text-yellow-400">
              {award.emoji} {award.label}
            </span>{' '}
            award in the{' '}
            <span className="font-bold text-white">
              {YEAR} Touchless Car Wash Chain Rankings
            </span>
          </p>
          <p className="text-blue-200/70 text-sm">{award.description}</p>

          {/* Chain stats */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-8">
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
        </div>
      </section>

      {/* Badge + Embed Code */}
      <section className="py-14 px-4">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-2">Your Award Badge</h2>
          <p className="text-gray-600 mb-8">
            Display this badge on your website to show customers you&apos;re independently
            recognized as a top touchless car wash chain. It&apos;s completely free.
          </p>
          <ChainBadgeClaimClient
            chainName={chain.name}
            awardLabel={award.label}
            awardEmoji={award.emoji}
            badgeSvgUrl={badgeSvgUrl}
            chainUrl={chainUrl}
            year={YEAR}
          />
        </div>
      </section>

      {/* Chain listing card */}
      <section className="py-14 px-4 bg-gray-50">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-6">Your Chain Listing</h2>
          <Link
            href={`/chain/${slug}`}
            className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-[#0F2744] group-hover:text-[#22C55E] transition-colors">
                  {chain.name}
                </h3>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    {ranked.locationCount} touchless locations across {ranked.statesPresent.length} states
                  </span>
                  {ranked.avgRating && (
                    <span className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      {ranked.avgRating.toFixed(1)} avg rating
                    </span>
                  )}
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${award.color} ${award.textColor}`}>
                {award.emoji} {award.label}
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* Why display */}
      <section className="py-14 px-4">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-6">Why Display This Badge?</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center p-6 rounded-xl bg-gray-50">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-100 mb-4">
                <Trophy className="w-6 h-6 text-yellow-600" />
              </div>
              <h3 className="font-semibold text-[#0F2744] mb-2">Build Trust</h3>
              <p className="text-sm text-gray-600">
                Show customers you&apos;re independently ranked among America&apos;s top touchless car wash chains.
              </p>
            </div>
            <div className="text-center p-6 rounded-xl bg-gray-50">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
                <Star className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="font-semibold text-[#0F2744] mb-2">Stand Out</h3>
              <p className="text-sm text-gray-600">
                Differentiate your brand from competitors with a verified third-party award on your website and marketing.
              </p>
            </div>
            <div className="text-center p-6 rounded-xl bg-gray-50">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-4">
                <MapPin className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-[#0F2744] mb-2">Drive Traffic</h3>
              <p className="text-sm text-gray-600">
                The badge links to your chain&apos;s directory page where customers can find all your locations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Back link */}
      <section className="pb-14 px-4">
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
