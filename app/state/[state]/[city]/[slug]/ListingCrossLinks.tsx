/**
 * Full-width sections below the main grid: "More <chain> Locations", the
 * top-ranked metro siblings block, nearby washes, affiliate products,
 * related reading, and the last-verified footer line.
 */
import Link from 'next/link';
import { ChevronRight, CalendarCheck, Trophy } from 'lucide-react';
import { RelatedReading } from '@/components/RelatedReading';
import type { Listing } from '@/lib/supabase';
import { earnsTrophy } from '@/lib/metro-scoring';
import { NearbyListingCard } from './listing-ui';
import type { BestOfRanking } from './listing-data';

interface ListingCrossLinksProps {
  listing: Listing;
  stateSlug: string;
  citySlug: string;
  stateName: string;
  cityName: string;
  chainResult: { chainName: string | null; listings: Listing[] };
  trophyRanking: BestOfRanking | null;
  metroSiblings: Array<{ listing: Listing; rank: number }>;
  nearbyListings: Listing[];
  lastVerified: string | null;
}

export function ListingCrossLinks({
  listing,
  stateSlug,
  citySlug,
  stateName,
  cityName,
  chainResult,
  trophyRanking,
  metroSiblings,
  nearbyListings,
  lastVerified,
}: ListingCrossLinksProps) {
  return (
    <>
      {chainResult.listings.length > 0 && chainResult.chainName && (
        <div className="mt-10">
          <h2 className="text-xl font-bold text-[#0F2744] mb-5">
            More {chainResult.chainName} Locations
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {chainResult.listings.map((cl) => (
              <NearbyListingCard key={cl.id} nearby={cl} />
            ))}
          </div>
        </div>
      )}

      {/* Other Top-Ranked washes in the same metro — only renders for
          listings that themselves carry a Best-Of rank. Surfaces the
          full ranked alternatives inline so users don't have to bounce
          to /best/[metro] to discover them. Each card is its own
          click target (PV/session multiplier). */}
      {trophyRanking && metroSiblings.length > 0 && (
        <div className="mt-10 rounded-2xl border border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="shrink-0 w-9 h-9 rounded-full bg-yellow-400 text-yellow-900 flex items-center justify-center shadow">
                <Trophy className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#0F2744]">
                  More Top-Ranked Touchless Washes in {trophyRanking.metro_name}
                </h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  {listing.name} ranked #{trophyRanking.rank}. Here&rsquo;s the rest of the top {Math.min(10, metroSiblings.length + 1)}.
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {metroSiblings.map(({ listing: sibling, rank }) => (
              <div key={sibling.id} className="relative">
                <NearbyListingCard nearby={sibling} />
                {/* Trophy chip only on siblings whose own score earns it (see earnsTrophy) */}
                {earnsTrophy(sibling) && (
                  <div className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-400 text-yellow-900 text-[11px] font-bold shadow">
                    <Trophy className="w-2.5 h-2.5" />#{rank}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-6 pt-5 border-t border-yellow-200 flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-gray-600">
              Ranked by our Touchless Satisfaction Score, customer reviews, and touchless confirmation.
            </p>
            <Link
              href={`/best/${trophyRanking.metro_slug}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2744] text-white text-sm font-semibold hover:bg-[#1a3a5e] transition-colors"
            >
              View the Full Top 10 in {trophyRanking.metro_name.split(',')[0]}
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {nearbyListings.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-[#0F2744]">
              Other Touchless Car Washes Near {cityName}
            </h2>
            <Link
              href={`/state/${stateSlug}/${citySlug}`}
              className="text-sm text-[#22C55E] hover:underline font-medium"
            >
              View all in {cityName}
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {nearbyListings.map((nearby) => (
              <NearbyListingCard key={nearby.id} nearby={nearby} />
            ))}
          </div>
          <div className="mt-6 pt-5 border-t border-gray-200 flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-gray-500">
              Explore all touchless and touch-free car washes in {stateName}
            </p>
            <Link
              href={`/state/${stateSlug}`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#0F2744] hover:text-[#22C55E] transition-colors"
            >
              Browse more in {stateName}
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      <RelatedReading />

      {lastVerified && (
        <div className="mt-8 pt-6 border-t border-gray-200 flex items-center gap-2 text-xs text-gray-400">
          <CalendarCheck className="w-3.5 h-3.5" />
          <span>Last verified: {lastVerified}</span>
        </div>
      )}
    </>
  );
}
