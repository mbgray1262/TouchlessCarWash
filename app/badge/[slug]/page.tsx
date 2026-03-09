import { cache } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Trophy, Star, MapPin, ExternalLink, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getStateSlug } from '@/lib/constants';
import { BadgeClaimClient } from '@/components/BadgeClaimClient';
import type { Metadata } from 'next';

export const revalidate = 86400;

// ── Types ────────────────────────────────────────────────────────────────

interface BestOfRanking {
  metro_slug: string;
  metro_name: string;
  rank: number;
  score: number;
}

interface RankedListing {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  address: string;
  rating: number | null;
  review_count: number | null;
  hero_image: string | null;
  google_photo_url: string | null;
  website: string | null;
}

// ── Data fetching ────────────────────────────────────────────────────────

const getListingBySlug = cache(async (slug: string) => {
  const { data } = await supabase
    .from('listings')
    .select(
      'id, name, slug, city, state, address, rating, review_count, hero_image, google_photo_url, website'
    )
    .eq('slug', slug)
    .maybeSingle();
  return data as RankedListing | null;
});

const getRankings = cache(async (listingId: string) => {
  const { data } = await supabase
    .from('best_of_rankings')
    .select('metro_slug, metro_name, rank, score')
    .eq('listing_id', listingId)
    .order('rank', { ascending: true });
  return (data || []) as BestOfRanking[];
});

// ── SEO Metadata ─────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) return { title: 'Badge Not Found' };

  const rankings = await getRankings(listing.id);
  if (rankings.length === 0) return { title: 'Badge Not Found' };

  const top = rankings[0];
  const title = `${listing.name} \u2014 #${top.rank} Best Touchless Car Wash in ${top.metro_name} | Claim Your Badge`;
  const description = `${listing.name} is ranked #${top.rank} Best Touchless Car Wash in ${top.metro_name}. Claim your free award badge and display it on your website.`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://touchlesscarwashfinder.com/badge/${listing.slug}`,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: `https://touchlesscarwashfinder.com/badge/${listing.slug}`,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function buildListingUrl(listing: RankedListing): string {
  const stateSlug = getStateSlug(listing.state);
  const citySlug = listing.city.toLowerCase().replace(/\s+/g, '-');
  return `https://touchlesscarwashfinder.com/state/${stateSlug}/${citySlug}/${listing.slug}`;
}

function ordinal(rank: number): string {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  return '3rd';
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function BadgeClaimPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) notFound();

  const rankings = await getRankings(listing.id);
  if (rankings.length === 0) notFound();

  const top = rankings[0];
  const year = new Date().getFullYear();
  const listingUrl = buildListingUrl(listing);
  const listingPath = `/state/${getStateSlug(listing.state)}/${listing.city.toLowerCase().replace(/\s+/g, '-')}/${listing.slug}`;

  return (
    <main className="min-h-screen bg-white">
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="bg-[#0F2744] text-white py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          {/* Trophy */}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-yellow-400/20 mb-6">
            <Trophy className="w-10 h-10 text-yellow-400" />
          </div>

          <p className="text-blue-200/70 text-sm font-medium uppercase tracking-widest mb-2">
            Claim Your Badge
          </p>

          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Congratulations, {listing.name}!
          </h1>

          <p className="text-xl text-blue-100">
            You&apos;re ranked{' '}
            <span className="font-bold text-yellow-400">
              #{top.rank}
            </span>{' '}
            Best Touchless Car Wash in{' '}
            <span className="font-bold text-white">{top.metro_name}</span>
          </p>

          {rankings.length > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {rankings.slice(1).map((r) => (
                <span
                  key={r.metro_slug}
                  className="inline-flex items-center gap-1 bg-white/10 rounded-full px-3 py-1 text-sm"
                >
                  <Trophy className="w-3 h-3 text-yellow-400" />#{r.rank} in{' '}
                  {r.metro_name}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Badge Preview + Embed Code ─────────────────────────────── */}
      <section className="py-14 px-4">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-2">
            Your Award Badge
          </h2>
          <p className="text-gray-600 mb-8">
            Display this badge on your website to let customers know you&apos;re
            a top-rated touchless car wash. It&apos;s completely free.
          </p>

          <BadgeClaimClient
            listingSlug={listing.slug}
            listingName={listing.name}
            listingUrl={listingUrl}
            rank={top.rank}
            metroName={top.metro_name}
            year={year}
          />
        </div>
      </section>

      {/* ── Your Listing Card ──────────────────────────────────────── */}
      <section className="py-14 px-4 bg-gray-50">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-6">
            Your Listing
          </h2>

          <Link
            href={listingPath}
            className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-[#0F2744] group-hover:text-[#22C55E] transition-colors">
                  {listing.name}
                </h3>
                <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                  {listing.rating && (
                    <span className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      {listing.rating}
                      {listing.review_count
                        ? ` (${listing.review_count.toLocaleString()} reviews)`
                        : ''}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    {listing.city}, {listing.state}
                  </span>
                </div>
                {listing.address && (
                  <p className="text-sm text-gray-500 mt-1">
                    {listing.address}
                  </p>
                )}
              </div>
              <ExternalLink className="w-5 h-5 text-gray-400 group-hover:text-[#22C55E] transition-colors flex-shrink-0 mt-1" />
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              {rankings.map((r) => (
                <span
                  key={r.metro_slug}
                  className="inline-flex items-center gap-1 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-full px-3 py-1 text-xs font-medium"
                >
                  <Trophy className="w-3 h-3" />#{r.rank} Best in{' '}
                  {r.metro_name}
                </span>
              ))}
            </div>
          </Link>

          {listing.website && (
            <p className="text-sm text-gray-500 mt-4">
              Customers find your listing at{' '}
              <Link
                href={listingPath}
                className="text-[#22C55E] hover:underline font-medium"
              >
                touchlesscarwashfinder.com
              </Link>
            </p>
          )}
        </div>
      </section>

      {/* ── Why Display This Badge ─────────────────────────────────── */}
      <section className="py-14 px-4">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-6">
            Why Display This Badge?
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center p-6 rounded-xl bg-gray-50">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-100 mb-4">
                <Trophy className="w-6 h-6 text-yellow-600" />
              </div>
              <h3 className="font-semibold text-[#0F2744] mb-2">
                Build Trust
              </h3>
              <p className="text-sm text-gray-600">
                Show customers you&apos;re independently ranked as a top
                touchless car wash in your area.
              </p>
            </div>

            <div className="text-center p-6 rounded-xl bg-gray-50">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
                <Star className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="font-semibold text-[#0F2744] mb-2">
                Stand Out
              </h3>
              <p className="text-sm text-gray-600">
                Differentiate your business from competitors with a verified
                award badge on your website.
              </p>
            </div>

            <div className="text-center p-6 rounded-xl bg-gray-50">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-4">
                <MapPin className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-[#0F2744] mb-2">
                Drive Traffic
              </h3>
              <p className="text-sm text-gray-600">
                The badge links to your detailed listing where customers can
                find your hours, location, and reviews.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Back link ──────────────────────────────────────────────── */}
      <section className="pb-14 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <Link
            href={`/best/${top.metro_slug}`}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-[#22C55E] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            View all top car washes in {top.metro_name}
          </Link>
        </div>
      </section>
    </main>
  );
}
