'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'tcwf_favorites';

function readFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeFavorites(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // storage full or unavailable
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    setFavorites(readFavorites());
  }, []);

  const toggle = useCallback((listingId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(listingId)
        ? prev.filter((id) => id !== listingId)
        : [...prev, listingId];
      writeFavorites(next);
      // Dispatch storage event so other components react
      window.dispatchEvent(new Event('favorites-changed'));
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (listingId: string) => favorites.includes(listingId),
    [favorites],
  );

  // Listen for changes from other components
  useEffect(() => {
    const handler = () => setFavorites(readFavorites());
    window.addEventListener('favorites-changed', handler);
    return () => window.removeEventListener('favorites-changed', handler);
  }, []);

  return { favorites, toggle, isFavorite };
}
