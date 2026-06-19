import { cache } from 'react';
import { supabase, LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { PAGE_SIZE } from '@/components/Pagination';
import { scoreListing } from '@/lib/metro-scoring';

export interface Filter {
  id: number;
  name: string;
  slug: string;
  category: string;
  icon: string | null;
}

export const getFilters = cache(async (): Promise<Filter[]> => {
  const { data } = await supabase
    .from('filters')
    .select('id, name, slug, category, icon')
    .order('sort_order');
  return (data as Filter[]) ?? [];
});

/** Get all listing IDs for a state (just IDs, for scoping filter queries) */
export async function getStateListingIds(stateCode: string): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;
  const BATCH = 1000;
  while (true) {
    const { data } = await supabase
      .from('listings')
      .select('id')
      .eq('is_touchless', true)
      .eq('state', stateCode)
      .range(offset, offset + BATCH - 1);
    if (!data || data.length === 0) break;
    ids.push(...data.map((d: { id: string }) => d.id));
    if (data.length < BATCH) break;
    offset += BATCH;
  }
  return ids;
}

/** From a scoped set of listing IDs, find those matching ALL given filter slugs */
export async function filterByFilters(
  scopeIds: string[],
  filterSlugs: string[],
  allFilters: Filter[],
): Promise<string[] | null> {
  if (filterSlugs.length === 0) return null; // null = no filter applied

  const filterIds = filterSlugs
    .map(slug => allFilters.find(f => f.slug === slug)?.id)
    .filter((id): id is number => id != null);

  if (filterIds.length === 0) return null;

  // Chunk the scope IDs to avoid 414 Request-URI Too Large
  const allRows: { listing_id: string }[] = [];
  const CHUNK = 200;
  for (let i = 0; i < scopeIds.length; i += CHUNK) {
    const chunk = scopeIds.slice(i, i + CHUNK);
    const { data } = await supabase
      .from('listing_filters')
      .select('listing_id')
      .in('listing_id', chunk)
      .in('filter_id', filterIds);
    if (data) allRows.push(...(data as { listing_id: string }[]));
  }

  // Count per listing — only keep those matching ALL filters
  const idCounts: Record<string, number> = {};
  for (const row of allRows) {
    idCounts[row.listing_id] = (idCounts[row.listing_id] ?? 0) + 1;
  }
  return Object.entries(idCounts)
    .filter(([, count]) => count === filterIds.length)
    .map(([id]) => id);
}

/** Paginated query — fetches PAGE_SIZE rows with card columns */
export async function getStateListingsPaginated(
  stateCode: string,
  page: number,
  qualifiedIds: string[] | null,
): Promise<Listing[]> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('listings')
    .select(LISTING_CARD_COLUMNS)
    .eq('is_touchless', true)
    .eq('state', stateCode);

  if (qualifiedIds !== null) {
    if (qualifiedIds.length === 0) return [];
    query = query.in('id', qualifiedIds);
  }

  // "Recommended" = the proprietary, TSS-first scoreListing composite (same
  // ranking the /best pages use), not raw Google stars. scoreListing isn't a DB
  // column so we fetch the whole state (max ~364 touchless listings, well under
  // the 1000 cap), rank in memory, then slice the requested page.
  const { data, error } = await query.limit(1000);

  if (error) {
    console.error('Error fetching state listings:', error);
    return [];
  }

  const all = ((data as Listing[]) || []).sort((a, b) => scoreListing(b) - scoreListing(a));
  return all.slice(from, to + 1);
}

/**
 * Canonical count of listings visible to users — touchless AND approved.
 * Single source of truth for the "X+ Verified Listings" stat that appears
 * on the home page, About page, blog post intros, and any other place we
 * advertise the directory size. Without this shared helper the counts drift
 * (e.g. About page used to query without is_approved and showed ~80 more
 * than the home page).
 */
export async function getApprovedTouchlessCount(): Promise<number> {
  const { count, error } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('is_touchless', true)
    .eq('is_approved', true);
  return error ? 0 : (count ?? 0);
}

export async function getStateListingCountFiltered(stateCode: string, qualifiedIds: string[] | null): Promise<number> {
  if (qualifiedIds !== null && qualifiedIds.length === 0) return 0;

  let query = supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('is_touchless', true)
    .eq('state', stateCode);

  if (qualifiedIds !== null) {
    query = query.in('id', qualifiedIds);
  }

  const { count } = await query;
  return count ?? 0;
}
