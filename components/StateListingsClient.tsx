'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { ListingCard } from '@/components/ListingCard';
import { ClientPagination, PAGE_SIZE } from '@/components/Pagination';
import { SearchFilters } from '@/components/SearchFilters';
import type { Listing } from '@/lib/supabase';

const LISTING_CARD_COLUMNS =
  'id, name, slug, city, state, address, phone, rating, review_count, hero_image, google_photo_url, street_view_url, logo_photo, google_logo_url, amenities, touchless_wash_types, extracted_data, hours, is_touchless, is_featured, is_claimed';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface Filter {
  id: number;
  name: string;
  slug: string;
  category: string;
  icon: string | null;
}

interface StateListingsClientProps {
  stateCode: string;
  stateSlug: string;
  stateName: string;
  initialListings: Listing[];
  totalCount: number;
  allFilters: Filter[];
}

export function StateListingsClient({
  stateCode,
  stateSlug,
  stateName,
  initialListings,
  totalCount: serverTotal,
  allFilters,
}: StateListingsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawPage = parseInt(searchParams.get('page') ?? '1', 10) || 1;
  const filterSlugs = searchParams.get('filters')?.split(',').filter(Boolean) ?? [];
  const hasFilters = filterSlugs.length > 0;
  const isDefault = !hasFilters && rawPage === 1;

  const [listings, setListings] = useState<Listing[]>(initialListings);
  const [totalCount, setTotalCount] = useState(serverTotal);
  const [loading, setLoading] = useState(false);

  // Track the filter+page key so we can skip stale fetches
  const fetchKey = `${filterSlugs.join(',')}|${rawPage}`;
  const prevFetchKey = useRef(fetchKey);

  const fetchListings = useCallback(async () => {
    // If default view (page 1, no filters), use the server-provided data
    if (isDefault) {
      setListings(initialListings);
      setTotalCount(serverTotal);
      return;
    }

    setLoading(true);
    try {
      // Resolve filter IDs → qualified listing IDs
      let qualifiedIds: string[] | null = null;
      if (hasFilters) {
        const filterIds = filterSlugs
          .map((slug) => allFilters.find((f) => f.slug === slug)?.id)
          .filter((id): id is number => id != null);

        if (filterIds.length > 0) {
          const { data: rows } = await supabase
            .from('listing_filters')
            .select('listing_id')
            .in('filter_id', filterIds)
            .limit(5000);

          if (rows) {
            const idCounts: Record<string, number> = {};
            for (const row of rows) {
              idCounts[row.listing_id] = (idCounts[row.listing_id] ?? 0) + 1;
            }
            qualifiedIds = Object.entries(idCounts)
              .filter(([, count]) => count === filterIds.length)
              .map(([id]) => id);
          }
        }
      }

      // Fetch paginated listings
      const from = (rawPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('listings')
        .select(LISTING_CARD_COLUMNS, { count: 'exact' })
        .eq('is_touchless', true)
        .eq('state', stateCode)
        .order('rating', { ascending: false });

      if (qualifiedIds !== null) {
        if (qualifiedIds.length === 0) {
          setListings([]);
          setTotalCount(0);
          return;
        }
        query = query.in('id', qualifiedIds);
      }

      const { data, count } = await query.range(from, to);
      setListings((data as Listing[]) ?? []);
      setTotalCount(count ?? 0);
    } catch (err) {
      console.error('Error fetching listings:', err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, isDefault]);

  useEffect(() => {
    if (prevFetchKey.current !== fetchKey || isDefault) {
      prevFetchKey.current = fetchKey;
      fetchListings();
    }
  }, [fetchKey, fetchListings, isDefault]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const currentPage = Math.min(rawPage, Math.max(totalPages, 1));

  function handlePageChange(newPage: number) {
    const params = new URLSearchParams();
    if (filterSlugs.length > 0) params.set('filters', filterSlugs.join(','));
    if (newPage > 1) params.set('page', String(newPage));
    const qs = params.toString();
    router.push(`/state/${stateSlug}${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-bold text-foreground mb-6">
        {hasFilters ? (
          <>
            {totalCount} of {serverTotal} Location{serverTotal !== 1 ? 's' : ''}
          </>
        ) : (
          <>
            All Locations{' '}
            <span className="text-lg font-normal text-gray-400">({totalCount})</span>
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
        baseHref={`/state/${stateSlug}`}
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="h-64 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : listings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              href={`/state/${stateSlug}/${listing.city.toLowerCase().replace(/\s+/g, '-')}/${listing.slug}`}
            />
          ))}
        </div>
      ) : hasFilters ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-gray-500 text-lg mb-2">
            No listings match the selected filters in {stateName}.
          </p>
          <p className="text-gray-400 text-sm">Try removing some filters to see more results.</p>
        </div>
      ) : null}

      <ClientPagination
        currentPage={currentPage}
        totalItems={totalCount}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
