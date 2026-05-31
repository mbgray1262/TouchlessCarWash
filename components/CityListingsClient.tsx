'use client';

import { useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ListingCard } from '@/components/ListingCard';
import { ClientPagination, PAGE_SIZE } from '@/components/Pagination';
import { SearchFilters } from '@/components/SearchFilters';
import type { Listing } from '@/lib/supabase';

interface Filter {
  id: number;
  name: string;
  slug: string;
  category: string;
  icon: string | null;
}

interface CityListingsClientProps {
  stateSlug: string;
  citySlug: string;
  stateName: string;
  cityName: string;
  stateCode: string;
  /** All listings for this city (typically <50) — filtering is done in-memory */
  allListings: Listing[];
  allFilters: Filter[];
  /** Pre-computed map: filter_id → Set of listing IDs that have that filter */
  filterMap: Record<number, string[]>;
  /**
   * Optional map of listing_id → Best Of rank (1, 2, or 3) within the
   * surrounding metro. When provided, matching cards render a trophy
   * badge to highlight top-rated washes and reinforce the /best/[metro] CTA.
   */
  rankMap?: Record<string, number>;
}

export function CityListingsClient({
  stateSlug,
  citySlug,
  stateName,
  cityName,
  stateCode,
  allListings,
  allFilters,
  filterMap,
  rankMap,
}: CityListingsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawPage = parseInt(searchParams.get('page') ?? '1', 10) || 1;
  const filterSlugs = searchParams.get('filters')?.split(',').filter(Boolean) ?? [];
  const hasFilters = filterSlugs.length > 0;

  // Filter listings in memory (city-level data is small enough)
  const filteredListings = useMemo(() => {
    if (!hasFilters) return allListings;

    const filterIds = filterSlugs
      .map((slug) => allFilters.find((f) => f.slug === slug)?.id)
      .filter((id): id is number => id != null);

    if (filterIds.length === 0) return allListings;

    return allListings.filter((listing) =>
      filterIds.every((fid) => filterMap[fid]?.includes(listing.id)),
    );
  }, [allListings, filterSlugs.join(','), allFilters, filterMap, hasFilters]);

  const totalPages = Math.ceil(filteredListings.length / PAGE_SIZE);
  const currentPage = Math.min(rawPage, Math.max(totalPages, 1));
  const paginatedListings = filteredListings.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function handlePageChange(newPage: number) {
    const params = new URLSearchParams();
    if (filterSlugs.length > 0) params.set('filters', filterSlugs.join(','));
    if (newPage > 1) params.set('page', String(newPage));
    const qs = params.toString();
    router.push(`/state/${stateSlug}/${citySlug}${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  return (
    <>
      {allListings.length > 1 && (
        <>
          <h2 className="text-2xl font-bold text-foreground mb-4">
            {hasFilters ? (
              <>
                {filteredListings.length} of {allListings.length} Location
                {allListings.length !== 1 ? 's' : ''}
              </>
            ) : (
              <>
                All Locations{' '}
                <span className="text-lg font-normal text-gray-400">
                  ({allListings.length})
                </span>
              </>
            )}
            {totalPages > 1 && (
              <span className="text-base font-normal text-gray-400 ml-2">
                · Page {currentPage} of {totalPages}
              </span>
            )}
          </h2>
          <SearchFilters
            filters={allFilters}
            activeFilterSlugs={filterSlugs}
            currentQuery=""
            baseHref={`/state/${stateSlug}/${citySlug}`}
          />
        </>
      )}

      {paginatedListings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedListings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              href={`/state/${stateSlug}/${citySlug}/${listing.slug}`}
              rank={rankMap?.[listing.id]}
            />
          ))}
        </div>
      ) : hasFilters ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-gray-500 text-lg mb-2">
            No listings match the selected filters in {cityName}.
          </p>
          <p className="text-gray-400 text-sm">Try removing some filters to see more results.</p>
        </div>
      ) : null}

      <ClientPagination
        currentPage={currentPage}
        totalItems={filteredListings.length}
        onPageChange={handlePageChange}
      />
    </>
  );
}
