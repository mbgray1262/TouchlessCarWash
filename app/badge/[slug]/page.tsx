import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { Trophy, Star, MapPin, ExternalLink, ArrowLeft, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { earnsTrophy } from '@/lib/metro-scoring';
import { BadgeClaimClient } from '@/components/BadgeClaimClient';
import { BadgeShareClient } from '@/components/BadgeShareClient';
import type { Metadata } from 'next';

export const revalidate = 3600; // 1 hour
// ISR on-demand: prerender none at build, but mark the route static so each
// render is cached at the Netlify edge. A dynamic [param] route WITHOUT
// generateStaticParams is treated as fully dynamic (no-store) and bypasses the CDN.
export function generateStaticParams() { return []; }

// ── Types ────────────────────────────────────────────────────────────────

interface BestOfRanking {
  metro_slug: string;
  metro_name: string;
  rank: number;
  score: number;
  computed_at: string;
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
  touchless_satisfaction_score: number | null;
}

// ── Data fetching ────────────────────────────────────────────────────────

const getListingBySlug = cache(async (slug: string) => {
  const { data } = await supabase
    .from('listings')
    .select(
      'id, name, slug, city, state, address, rating, review_count, hero_image, google_photo_url, website, touchless_satisfaction_score'
    )
    .eq('slug', slug)
    .maybeSingle();
  return data as RankedListing | null;
});

const getRankings = cache(async (listingId: string) => {
  const { data } = await supabase
    .from('best_of_rankings')
    .select('metro_slug, metro_name, rank, score, computed_at')
    .eq('listing_id', listingId)
    .order('rank', { ascending: true });
  // Only include rankings within top 10 — rank > 10 has no badge
  return ((data || []) as BestOfRanking[]).filter(r => r.rank <= 10);
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
  // No badge for a ranked-but-below-"Good" wash — it keeps its /best listing but
  // doesn't earn a displayable trophy (see earnsTrophy).
  if (rankings.length === 0 || !earnsTrophy(listing)) return { title: 'Badge Not Found' };

  const top = rankings[0];
  const rankLabel = top.rank <= 3 ? `#${top.rank}` : 'Top 10';
  const title = `${listing.name} \u2014 ${rankLabel} Best Touchless Car Wash in ${top.metro_name} | Claim Your Badge`;
  const description = `${listing.name} is ranked ${rankLabel} Best Touchless Car Wash in ${top.metro_name}. Claim your free award badge and display it on your website.`;

  return {
    title,
    description,
    // noindex: this is a "claim your badge" conversion page for the wash owner,
    // not search content — it duplicates the ranking already covered by the
    // indexable /best/<metro> pages. Kept out of the index (and the sitemap) so
    // it doesn't compete with the canonical ranking pages. follow:true so the
    // outbound links to the listing/ranking pages still pass equity.
    robots: { index: false, follow: true },
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
  const citySlug = slugify(listing.city);
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
  // Listing was deleted from the DB entirely — redirect to the chain
  // index instead of 404. Indexed badge URLs for removed listings get a
  // clean signal rather than dragging down site-wide quality metrics.
  if (!listing) permanentRedirect('/chains');

  const rankings = await getRankings(listing.id);
  // Listing exists but has no current Best Of rankings (rolled out of
  // the top 10 in its metro, or never qualified). Redirect to the
  // listing's own detail page — that page handles its own redirect
  // cascade if the listing is now reverted/closed/removed.
  // No rankings, OR ranked but below "Good" (doesn't earn a displayable trophy):
  // send the owner to their own listing page rather than a badge they can't claim.
  if (rankings.length === 0 || !earnsTrophy(listing)) {
    permanentRedirect(
      `/state/${getStateSlug(listing.state)}/${slugify(listing.city) || 'unknown'}/${listing.slug}`,
    );
  }

  const top = rankings[0];
  // Freeze to the award year (computed_at), not the live current year, so the
  // claimed badge's wording never silently flips to a new year.
  const year = top.computed_at ? new Date(top.computed_at).getFullYear() : new Date().getFullYear();
  const listingUrl = buildListingUrl(listing);
  const listingPath = `/state/${getStateSlug(listing.state)}/${slugify(listing.city)}/${listing.slug}`;

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
            {top.rank <= 3 ? (
              <>
                You&apos;re ranked{' '}
                <span className="font-bold text-yellow-400">#{top.rank}</span>{' '}
                Best Touchless Car Wash in{' '}
                <span className="font-bold text-white">{top.metro_name}</span>
              </>
            ) : (
              <>
                You&apos;re in the{' '}
                <span className="font-bold text-yellow-400">Top 10</span>{' '}
                Best Touchless Car Washes in{' '}
                <span className="font-bold text-white">{top.metro_name}</span>
              </>
            )}
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
            {top.rank <= 3 ? 'Your Award Badge' : 'Your Top 10 Badge'}
          </h2>
          <p className="text-gray-600 mb-8">
            {top.rank <= 3
              ? "Display this badge on your website to let customers know you're a top-rated touchless car wash. It's completely free."
              : `Display this badge on your website to show customers you're one of the top 10 touchless car washes in ${top.metro_name}. It's completely free.`}
          </p>

          <BadgeClaimClient
            listingSlug={listing.slug}
            listingName={listing.name}
            listingUrl={listingUrl}
            rank={top.rank}
            metroName={top.metro_name}
            year={year}
          />

          {/* Share your win — one-click social posting (drives referral traffic) */}
          <BadgeShareClient
            listingSlug={listing.slug}
            listingName={listing.name}
            listingUrl={listingUrl}
            rank={top.rank}
            metroName={top.metro_name}
            year={year}
          />

          {/* Printable certificate — the lobby companion to the web badge */}
          <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-blue-50 border border-blue-100 rounded-xl p-6">
            <div>
              <h3 className="text-lg font-bold text-[#0F2744] mb-1">Prefer something for your lobby?</h3>
              <p className="text-sm text-gray-600">Download a printable certificate to frame at your front desk or window.</p>
            </div>
            <Link
              href={`/badge/${listing.slug}/certificate`}
              className="flex-shrink-0 inline-flex items-center gap-2 bg-[#0F2744] hover:bg-[#0F2744]/90 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              <Printer className="w-4 h-4" /> Get your certificate
            </Link>
          </div>
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
