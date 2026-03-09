'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ListingCard } from '@/components/ListingCard';
import { useFavorites } from '@/lib/useFavorites';
import { type Listing } from '@/lib/supabase';

export default function FavoritesPage() {
  const { favorites } = useFavorites();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (favorites.length === 0) {
      setListings([]);
      setLoading(false);
      return;
    }

    async function fetchListings() {
      try {
        const res = await fetch(`/api/favorites?ids=${favorites.join(',')}`);
        if (res.ok) {
          const data = await res.json();
          setListings(data);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }

    fetchListings();
  }, [favorites]);

  return (
    <div className="min-h-screen">
      <div className="bg-[#0F2744] py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            <Heart className="inline w-8 h-8 mr-2 fill-red-500 text-red-500 -mt-1" />
            My Saved Washes
          </h1>
          <p className="text-white/80 text-lg">
            {favorites.length === 0
              ? 'You haven\'t saved any car washes yet.'
              : `${favorites.length} saved location${favorites.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-10">
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading your saved washes...</div>
        ) : listings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Heart className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No saved washes yet</h2>
            <p className="text-gray-500 mb-6">
              Tap the heart icon on any listing to save it here for quick access later.
            </p>
            <Button asChild>
              <Link href="/states">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Browse Car Washes
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
