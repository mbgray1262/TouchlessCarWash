'use client';

import { useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ListingCard } from '@/components/ListingCard';
import { ClientPagination, PAGE_SIZE } from '@/components/Pagination';
import { SearchFilters } from '@/components/SearchFilters';
import type { Listing } from '@/lib/supabase';
import { scoreListing } from '@/lib/metro-scoring';

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

  // Optional sort by Touchless Satisfaction Score (unscored fall to the bottom).
  const [sort, setSort] = useState<'recommended' | 'tss'>('recommended');
  const sortedListings = useMemo(() => {
    if (sort === 'tss') {
      return [...filteredListings].sort(
        (a, b) => (b.touchless_satisfaction_score ?? -1) - (a.touchless_satisfaction_score ?? -1),
      );
    }
    // 'recommended' = the proprietary, TSS-first composite (same scoreListing the
    // /best pages rank with): Touchless Satisfaction Score is the primary factor,
    // unscored washes fall back to a capped rating term, plus Paint-Safe + review
    // credibility. So the best *touchless* washes surface first instead of raw
    // Google stars.
    return [...filteredListings].sort((a, b) => scoreListing(b) - scoreListing(a));
  }, [filteredListings, sort]);

  const hasAnyScore = useMemo(
    () => allListings.some((l) => l.touchless_satisfaction_score != null),
    [allListings],
  );

  const totalPages = Math.ceil(sortedListings.length / PAGE_SIZE);
  const currentPage = Math.min(rawPage, Math.max(totalPages, 1));
  const paginatedListings = sortedListings.slice(
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
          {hasAnyScore && allListings.length > 1 && (
            <div className="flex items-center gap-2 -mt-2 mb-4">
              <label className="text-sm text-gray-500">Sort by:</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as 'recommended' | 'tss')}
                className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white font-medium text-[#0F2744] focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="recommended">Recommended</option>
                <option value="tss">Touchless Satisfaction Score</option>
              </select>
            </div>
          )}
        </>
      )}

      {paginatedListings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedListings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              href={`/state/${stateSlug}/${citySlug}/${listing.slug}`}
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
