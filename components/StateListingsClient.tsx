'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Search, X } from 'lucide-react';
import { ListingCard } from '@/components/ListingCard';
import { ClientPagination, PAGE_SIZE } from '@/components/Pagination';
import { SearchFilters } from '@/components/SearchFilters';
import type { Listing } from '@/lib/supabase';
import { slugify } from '@/lib/constants';
import { withPaintSafeChip, PAINT_SAFE_FILTER_SLUG } from '@/lib/paint-safe-filter';

const LISTING_CARD_COLUMNS =
  'id, name, slug, city, state, address, phone, rating, review_count, hero_image, google_photo_url, street_view_url, logo_photo, google_logo_url, amenities, touchless_wash_types, extracted_data, hours, is_touchless, is_featured, is_claimed, paint_safe_verified, touchless_satisfaction_score';

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
  hasPaintSafe: boolean;
}

export function StateListingsClient({
  stateCode,
  stateSlug,
  stateName,
  initialListings,
  totalCount: serverTotal,
  allFilters,
  hasPaintSafe,
}: StateListingsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawPage = parseInt(searchParams.get('page') ?? '1', 10) || 1;
  const filterSlugs = searchParams.get('filters')?.split(',').filter(Boolean) ?? [];
  const hasFilters = filterSlugs.length > 0;
  // Free-text search by city or wash name. Sanitize PostgREST-significant
  // characters so a stray comma/paren can't break the .or() expression.
  const query = (searchParams.get('q') ?? '').replace(/[%,()]/g, ' ').trim();
  const hasQuery = query.length > 0;
  const sortTss = searchParams.get('sort') === 'tss';
  const isDefault = !hasFilters && !hasQuery && !sortTss && rawPage === 1;

  const [listings, setListings] = useState<Listing[]>(initialListings);
  const [totalCount, setTotalCount] = useState(serverTotal);
  const [loading, setLoading] = useState(false);
  // Controlled value for the search input — mirrors the URL's ?q= but updates
  // instantly while the debounce timer waits before pushing to the URL.
  const [searchInput, setSearchInput] = useState(query);

  // Keep the input in sync if the URL changes externally (e.g. back button).
  useEffect(() => {
    setSearchInput(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Track the filter+page+query key so we can skip stale fetches
  const fetchKey = `${filterSlugs.join(',')}|${rawPage}|${query}|${sortTss ? 'tss' : 'rec'}`;
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
      // The Paint-Safe Verified chip is a synthetic filter on the
      // paint_safe_verified column — handle it separately from the amenity
      // filters, which join through listing_filters.
      const wantsPaintSafe = filterSlugs.includes(PAINT_SAFE_FILTER_SLUG);
      const amenitySlugs = filterSlugs.filter((s) => s !== PAINT_SAFE_FILTER_SLUG);

      // Resolve filter IDs → qualified listing IDs
      let qualifiedIds: string[] | null = null;
      if (amenitySlugs.length > 0) {
        const filterIds = amenitySlugs
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

      let dbQuery = supabase
        .from('listings')
        .select(LISTING_CARD_COLUMNS, { count: 'exact' })
        .eq('is_touchless', true)
        .eq('state', stateCode);

      // Free-text search across wash name OR city.
      if (hasQuery) {
        dbQuery = dbQuery.or(`name.ilike.%${query}%,city.ilike.%${query}%`);
      }

      if (wantsPaintSafe) {
        dbQuery = dbQuery.eq('paint_safe_verified', true);
      }

      dbQuery = sortTss
        ? dbQuery.order('touchless_satisfaction_score', { ascending: false, nullsFirst: false }).order('rating', { ascending: false })
        : dbQuery.order('rating', { ascending: false });

      if (qualifiedIds !== null) {
        if (qualifiedIds.length === 0) {
          setListings([]);
          setTotalCount(0);
          return;
        }
        dbQuery = dbQuery.in('id', qualifiedIds);
      }

      const { data, count } = await dbQuery.range(from, to);
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

  function pushState(opts: { page?: number; q?: string; sort?: 'tss' | 'recommended' }) {
    const params = new URLSearchParams();
    if (filterSlugs.length > 0) params.set('filters', filterSlugs.join(','));
    const nextQ = opts.q ?? query;
    if (nextQ) params.set('q', nextQ);
    const nextSort = opts.sort ?? (sortTss ? 'tss' : 'recommended');
    if (nextSort === 'tss') params.set('sort', 'tss');
    const nextPage = opts.page ?? 1;
    if (nextPage > 1) params.set('page', String(nextPage));
    const qs = params.toString();
    router.push(`/state/${stateSlug}${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  function handlePageChange(newPage: number) {
    pushState({ page: newPage });
  }

  // Debounce the search box: wait until typing pauses, then push ?q= to the
  // URL (resetting to page 1). A new query supersedes the previous timer.
  useEffect(() => {
    const trimmed = searchInput.replace(/[%,()]/g, ' ').trim();
    if (trimmed === query) return; // already in sync — nothing to push
    const timer = setTimeout(() => {
      pushState({ q: trimmed, page: 1 });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function clearSearch() {
    setSearchInput('');
    pushState({ q: '', page: 1 });
  }

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-bold text-foreground mb-4">
        {hasQuery ? (
          <>
            {totalCount} result{totalCount !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
          </>
        ) : hasFilters ? (
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

      {/* Search by city or wash name */}
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={`Search by city or wash name in ${stateName}…`}
          aria-label={`Search touchless car washes in ${stateName} by city or name`}
          className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-gray-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm"
        />
        {searchInput && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <SearchFilters
        filters={withPaintSafeChip(allFilters, hasPaintSafe)}
        activeFilterSlugs={filterSlugs}
        currentQuery=""
        baseHref={`/state/${stateSlug}`}
      />

      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm text-gray-500">Sort by:</label>
        <select
          value={sortTss ? 'tss' : 'recommended'}
          onChange={(e) => pushState({ sort: e.target.value as 'tss' | 'recommended', page: 1 })}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white font-medium text-[#0F2744] focus:border-primary focus:ring-1 focus:ring-primary outline-none"
        >
          <option value="recommended">Recommended</option>
          <option value="tss">Touchless Satisfaction Score</option>
        </select>
      </div>

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
              href={`/state/${stateSlug}/${slugify(listing.city)}/${listing.slug}`}
            />
          ))}
        </div>
      ) : hasQuery ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-gray-500 text-lg mb-2">
            No touchless car washes in {stateName} match &ldquo;{query}&rdquo;.
          </p>
          <button
            type="button"
            onClick={clearSearch}
            className="text-primary text-sm font-medium hover:underline"
          >
            Clear search
          </button>
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
