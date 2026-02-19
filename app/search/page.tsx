'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase, type Listing } from '@/lib/supabase';
import { ListingCard } from '@/components/ListingCard';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function searchListings() {
      setLoading(true);

      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('is_touchless', true)
        .or(`city.ilike.%${query}%,zip.ilike.%${query}%,state.ilike.%${query}%,name.ilike.%${query}%`)
        .order('rating', { ascending: false });

      if (!error && data) {
        setListings(data);
      }

      setLoading(false);
    }

    if (query) {
      searchListings();
    } else {
      setLoading(false);
    }
  }, [query]);

  return (
    <div className="min-h-screen">
      <div className="bg-[#0F2744] py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            {query ? <>Search Results for &ldquo;{query}&rdquo;</> : 'Find a Car Wash'}
          </h1>
          {!loading && query && (
            <p className="text-white/70 text-lg">
              {listings.length > 0
                ? `Found ${listings.length} touchless car wash${listings.length !== 1 ? 'es' : ''} matching your search`
                : `No results found for "${query}"`}
            </p>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-10">
        {loading ? (
          <div className="text-center py-16">
            <p className="text-gray-400">Searching...</p>
          </div>
        ) : !query ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-lg text-muted-foreground mb-4">Enter a city name or zip code to search</p>
              <Button asChild>
                <Link href="/#search">Go to Search</Link>
              </Button>
            </CardContent>
          </Card>
        ) : listings.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-lg text-muted-foreground mb-2">No results found for &ldquo;{query}&rdquo;</p>
              <p className="text-sm text-muted-foreground mb-6">Try searching with a different city name or zip code</p>
              <Button asChild>
                <Link href="/#search">Try Another Search</Link>
              </Button>
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
