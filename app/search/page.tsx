import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase, LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { ListingCard } from '@/components/ListingCard';
import { Pagination, PAGE_SIZE } from '@/components/Pagination';
import { SearchFilters } from '@/components/SearchFilters';
import type { Metadata } from 'next';

interface Filter {
  id: number;
  name: string;
  slug: string;
  category: string;
  icon: string | null;
}

interface SearchPageProps {
  searchParams: {
    q?: string;
    filters?: string;
    page?: string;
  };
}

async function getFilters(): Promise<Filter[]> {
  const { data } = await supabase
    .from('filters')
    .select('id, name, slug, category, icon')
    .order('sort_order');
  return data ?? [];
}

async function searchListings(
  query: string,
  activeFilterSlugs: string[],
  allFilters: Filter[]
): Promise<Listing[]> {
  const filterIds = activeFilterSlugs
    .map(slug => allFilters.find(f => f.slug === slug)?.id)
    .filter((id): id is number => id != null);

  if (filterIds.length > 0) {
    const { data: matchedRows } = await supabase
      .from('listing_filters')
      .select('listing_id')
      .in('filter_id', filterIds);

    if (!matchedRows || matchedRows.length === 0) return [];

    const idCounts: Record<string, number> = {};
    for (const row of matchedRows) {
      idCounts[row.listing_id] = (idCounts[row.listing_id] ?? 0) + 1;
    }
    const qualifiedIds = Object.entries(idCounts)
      .filter(([, count]) => count === filterIds.length)
      .map(([id]) => id);

    if (qualifiedIds.length === 0) return [];

    let q = supabase
      .from('listings')
      .select(LISTING_CARD_COLUMNS)
      .in('id', qualifiedIds)
      .order('rating', { ascending: false });

    if (query) {
      q = q.or(`city.ilike.%${query}%,zip.ilike.%${query}%,state.ilike.%${query}%,name.ilike.%${query}%`);
    }

    const { data } = await q;
    return (data as Listing[]) ?? [];
  } else {
    let q = supabase
      .from('listings')
      .select(LISTING_CARD_COLUMNS)
      .order('rating', { ascending: false });

    if (query) {
      q = q.or(`city.ilike.%${query}%,zip.ilike.%${query}%,state.ilike.%${query}%,name.ilike.%${query}%`);
    }

    const { data } = await q;
    return (data as Listing[]) ?? [];
  }
}

function buildBaseHref(query: string, activeFilterSlugs: string[]): string {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (activeFilterSlugs.length > 0) params.set('filters', activeFilterSlugs.join(','));
  const qs = params.toString();
  return `/search${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const query = searchParams.q || '';
  const filterSlugs = searchParams.filters?.split(',').filter(Boolean) ?? [];

  if (!query && filterSlugs.length === 0) {
    return {
      title: 'Search Touchless Car Washes',
      description: 'Search for touchless, touch-free, and brushless car washes by city, zip code, or filter. Find verified no-scratch car wash locations near you.',
    };
  }

  let title = '';
  if (query) {
    const displayQuery = query.replace(/\b\w/g, c => c.toUpperCase());
    title = `Touchless Car Washes in ${displayQuery}`;
  } else {
    title = 'Touchless Car Washes';
  }

  if (filterSlugs.length > 0) {
    const allFilters = await getFilters();
    const filterNames = filterSlugs
      .map(slug => allFilters.find(f => f.slug === slug)?.name)
      .filter(Boolean);
    if (filterNames.length > 0) {
      title += ` with ${filterNames.join(', ')}`;
    }
  }

  return {
    title,
    description: `Find touchless car washes${query ? ` in ${query}` : ''}${filterSlugs.length > 0 ? ' matching your filters' : ''}. Browse verified no-scratch car wash locations with ratings and reviews.`,
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = searchParams.q || '';
  const activeFilterSlugs = searchParams.filters?.split(',').filter(Boolean) ?? [];
  const currentPage = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);

  const allFilters = await getFilters();

  const hasSearch = query.length > 0 || activeFilterSlugs.length > 0;
  const listings = hasSearch
    ? await searchListings(query, activeFilterSlugs, allFilters)
    : [];

  const totalPages = Math.ceil(listings.length / PAGE_SIZE);
  const page = Math.min(currentPage, Math.max(1, totalPages));
  const paginatedListings = listings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resultLabel = hasSearch
    ? listings.length > 0
      ? `Found ${listings.length} car wash${listings.length !== 1 ? 'es' : ''}`
      : 'No results found'
    : null;

  const baseHref = buildBaseHref(query, activeFilterSlugs);

  const jsonLd = hasSearch && listings.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: query ? `Touchless Car Washes in ${query}` : 'Touchless Car Wash Search Results',
        numberOfItems: listings.length,
        itemListElement: paginatedListings.map((listing, index) => ({
          '@type': 'ListItem',
          position: (page - 1) * PAGE_SIZE + index + 1,
          name: listing.name,
          url: `https://touchlesscarwashfinder.com/state/${getStateSlug(listing.state)}/${slugify(listing.city)}/${listing.slug}`,
        })),
      }
    : null;

  return (
    <div className="min-h-screen">
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      <div className="bg-[#0F2744] py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            {query ? <>Results for &ldquo;{query}&rdquo;</> : 'Find a Car Wash'}
          </h1>
          {resultLabel && (
            <p className="text-white/70 text-lg">{resultLabel}</p>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-8">
        <SearchFilters
          filters={allFilters}
          activeFilterSlugs={activeFilterSlugs}
          currentQuery={query}
        />

        {!hasSearch ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-lg text-muted-foreground mb-4">Enter a city name or zip code to search, or select filters above</p>
              <Button asChild>
                <Link href="/#search">Go to Search</Link>
              </Button>
            </CardContent>
          </Card>
        ) : listings.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-lg text-muted-foreground mb-2">No results found{query ? ` for \u201c${query}\u201d` : ''}</p>
              <p className="text-sm text-muted-foreground mb-6">Try adjusting your filters or searching a different area</p>
              <div className="flex gap-3 justify-center">
                {activeFilterSlugs.length > 0 && (
                  <Button variant="outline" asChild>
                    <Link href={buildBaseHref(query, [])}>Clear Filters</Link>
                  </Button>
                )}
                <Button asChild>
                  <Link href="/#search">Try Another Search</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
            <Pagination
              currentPage={page}
              totalItems={listings.length}
              baseHref={baseHref}
            />
          </>
        )}
      </div>
    </div>
  );
}
