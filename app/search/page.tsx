'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, Clock, Wind, RefreshCw, Hand, Truck, IdCard, Car } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase, type Listing } from '@/lib/supabase';
import { ListingCard } from '@/components/ListingCard';

interface Filter {
  id: number;
  name: string;
  slug: string;
  category: string;
  icon: string | null;
}

const ICON_MAP: Record<string, React.ElementType> = {
  sparkles: Sparkles,
  clock: Clock,
  wind: Wind,
  'refresh-cw': RefreshCw,
  hand: Hand,
  truck: Truck,
  'id-card': IdCard,
  car: Car,
};

export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function loadFilters() {
      const { data } = await supabase
        .from('filters')
        .select('id, name, slug, category, icon')
        .order('sort_order');
      if (data) setFilters(data);
    }
    loadFilters();
  }, []);

  useEffect(() => {
    async function searchListings() {
      setLoading(true);

      if (activeFilters.size > 0) {
        const filterIds = Array.from(activeFilters);

        const { data: matchedListingIds } = await supabase
          .from('listing_filters')
          .select('listing_id')
          .in('filter_id', filterIds);

        if (!matchedListingIds || matchedListingIds.length === 0) {
          setListings([]);
          setLoading(false);
          return;
        }

        const idCounts: Record<string, number> = {};
        for (const row of matchedListingIds) {
          idCounts[row.listing_id] = (idCounts[row.listing_id] ?? 0) + 1;
        }
        const qualifiedIds = Object.entries(idCounts)
          .filter(([, count]) => count === filterIds.length)
          .map(([id]) => id);

        if (qualifiedIds.length === 0) {
          setListings([]);
          setLoading(false);
          return;
        }

        let q = supabase
          .from('listings')
          .select('*')
          .in('id', qualifiedIds)
          .order('rating', { ascending: false });

        if (query) {
          q = q.or(`city.ilike.%${query}%,zip.ilike.%${query}%,state.ilike.%${query}%,name.ilike.%${query}%`);
        }

        const { data, error } = await q;
        if (!error && data) setListings(data);
      } else {
        let q = supabase
          .from('listings')
          .select('*')
          .order('rating', { ascending: false });

        if (query) {
          q = q.or(`city.ilike.%${query}%,zip.ilike.%${query}%,state.ilike.%${query}%,name.ilike.%${query}%`);
        }

        const { data, error } = await q;
        if (!error && data) setListings(data);
      }

      setLoading(false);
    }

    if (query || activeFilters.size > 0) {
      searchListings();
    } else {
      setLoading(false);
    }
  }, [query, activeFilters]);

  function toggleFilter(id: number) {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const resultLabel = activeFilters.size > 0 || query
    ? listings.length > 0
      ? `Found ${listings.length} car wash${listings.length !== 1 ? 'es' : ''}`
      : 'No results found'
    : null;

  return (
    <div className="min-h-screen">
      <div className="bg-[#0F2744] py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            {query ? <>Results for &ldquo;{query}&rdquo;</> : 'Find a Car Wash'}
          </h1>
          {!loading && resultLabel && (
            <p className="text-white/70 text-lg">{resultLabel}</p>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-8">
        {filters.length > 0 && (
          <div className="mb-8">
            <div className="flex flex-wrap gap-2">
              {filters.map(f => {
                const Icon = ICON_MAP[f.icon ?? ''] ?? Sparkles;
                const active = activeFilters.has(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleFilter(f.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      active
                        ? 'bg-[#0F2744] border-[#0F2744] text-white'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-[#0F2744] hover:text-[#0F2744]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {f.name}
                  </button>
                );
              })}
            </div>
            {activeFilters.size > 0 && (
              <button
                onClick={() => setActiveFilters(new Set())}
                className="mt-3 text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16">
            <p className="text-gray-400">Searching...</p>
          </div>
        ) : !query && activeFilters.size === 0 ? (
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
                {activeFilters.size > 0 && (
                  <Button variant="outline" onClick={() => setActiveFilters(new Set())}>
                    Clear Filters
                  </Button>
                )}
                <Button asChild>
                  <Link href="/#search">Try Another Search</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
