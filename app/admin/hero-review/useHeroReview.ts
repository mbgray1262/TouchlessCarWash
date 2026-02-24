'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { HeroListing, FilterSource, ReplacementOption, SessionStats } from './types';

const PAGE_SIZE = 20;

export function useHeroReview() {
  const [listings, setListings] = useState<HeroListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [totalWithHero, setTotalWithHero] = useState(0);
  const [page, setPage] = useState(0);

  const [filterSource, setFilterSource] = useState<FilterSource>('all');
  const [filterState, setFilterState] = useState('');
  const [searchName, setSearchName] = useState('');
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [confirmMap, setConfirmMap] = useState<Record<string, number>>({});
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<SessionStats>({ replacements: 0, flagged: 0 });

  const flaggedIdsRef = useRef(flaggedIds);
  flaggedIdsRef.current = flaggedIds;

  useEffect(() => {
    const stored = sessionStorage.getItem('heroReviewFlagged');
    if (stored) {
      try { setFlaggedIds(new Set(JSON.parse(stored))); } catch {}
    }
  }, []);

  const buildQuery = useCallback(() => {
    let q = supabase
      .from('listings')
      .select('id, name, city, state, hero_image, hero_image_source, photos, google_photo_url, street_view_url, photo_enrichment_attempted_at', { count: 'exact' })
      .eq('is_touchless', true)
      .order('photo_enrichment_attempted_at', { ascending: false, nullsFirst: false });

    if (filterSource === 'none') {
      q = q.is('hero_image', null);
    } else if (filterSource !== 'all') {
      q = q.eq('hero_image_source', filterSource);
    }

    if (filterState) q = q.eq('state', filterState);
    if (searchName) q = q.ilike('name', `%${searchName}%`);

    return q;
  }, [filterSource, filterState, searchName]);

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, count, error } = await buildQuery().range(from, to);
      if (error) throw error;

      const items: HeroListing[] = (data ?? []).map((r) => ({
        ...r,
        hero_image_source: r.hero_image_source as HeroListing['hero_image_source'],
        flagged: flaggedIdsRef.current.has(r.id),
      }));

      const filtered = showFlaggedOnly ? items.filter(i => i.flagged) : items;
      setListings(filtered);
      setTotalCount(count ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, buildQuery, showFlaggedOnly]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  useEffect(() => {
    supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('is_touchless', true)
      .not('hero_image', 'is', null)
      .then(({ count }) => setTotalWithHero(count ?? 0));
  }, []);

  const getReplacements = (listing: HeroListing): ReplacementOption[] => {
    const opts: ReplacementOption[] = [];
    const seen = new Set<string>();

    const add = (url: string | null, label: string, source: string) => {
      if (url && !seen.has(url) && url !== listing.hero_image) {
        seen.add(url);
        opts.push({ url, label, source });
      }
    };

    const photos = listing.photos ?? [];
    photos.forEach((p, i) => add(p, `Gallery ${i + 1}`, 'gallery'));
    add(listing.google_photo_url, 'Google', 'google');
    add(listing.street_view_url, 'Street View', 'street_view');

    return opts.slice(0, 8);
  };

  const handleReplace = async (listingId: string, url: string | null, source: string, optIdx: number) => {
    const listing = listings.find(l => l.id === listingId);
    const oldHero = listing?.hero_image ?? null;

    setConfirmMap(prev => ({ ...prev, [listingId]: optIdx }));

    await supabase
      .from('listings')
      .update({ hero_image: url, hero_image_source: url ? source : null })
      .eq('id', listingId);

    await supabase.from('hero_reviews').insert({
      listing_id: listingId,
      action: url ? 'replaced' : 'removed',
      old_hero_url: oldHero,
      new_hero_url: url,
      new_source: url ? source : null,
    });

    setListings(prev =>
      prev.map(l => l.id === listingId
        ? { ...l, hero_image: url, hero_image_source: (url ? source : null) as HeroListing['hero_image_source'] }
        : l
      )
    );

    setStats(prev => ({ ...prev, replacements: prev.replacements + 1 }));

    setTimeout(() => {
      setConfirmMap(prev => { const n = { ...prev }; delete n[listingId]; return n; });
      setExpandedId(null);
    }, 800);
  };

  const handleRemoveHero = async (listingId: string) => {
    const listing = listings.find(l => l.id === listingId);
    const oldHero = listing?.hero_image ?? null;

    await supabase
      .from('listings')
      .update({ hero_image: null, hero_image_source: null })
      .eq('id', listingId);

    await supabase.from('hero_reviews').insert({
      listing_id: listingId,
      action: 'removed',
      old_hero_url: oldHero,
      new_hero_url: null,
      new_source: null,
    });

    setListings(prev =>
      prev.map(l => l.id === listingId
        ? { ...l, hero_image: null, hero_image_source: null }
        : l
      )
    );
  };

  const handleRemoveGalleryPhoto = async (listingId: string, photoUrl: string) => {
    const listing = listings.find(l => l.id === listingId);
    const currentPhotos = listing?.photos ?? [];
    const newPhotos = currentPhotos.filter(p => p !== photoUrl);

    const { data: current } = await supabase
      .from('listings')
      .select('blocked_photos')
      .eq('id', listingId)
      .maybeSingle();

    const blocked = (current?.blocked_photos as string[] | null) ?? [];
    const combined = blocked.concat(photoUrl);
    const newBlocked = combined.filter((v, i) => combined.indexOf(v) === i);

    await supabase
      .from('listings')
      .update({
        photos: newPhotos.length > 0 ? newPhotos : null,
        blocked_photos: newBlocked,
      })
      .eq('id', listingId);

    setListings(prev =>
      prev.map(l => l.id === listingId
        ? { ...l, photos: newPhotos.length > 0 ? newPhotos : null }
        : l
      )
    );
  };

  const handleFlag = async (listingId: string) => {
    const listing = listings.find(l => l.id === listingId);
    const alreadyFlagged = listing?.flagged;

    if (!alreadyFlagged) {
      await supabase.from('hero_reviews').insert({
        listing_id: listingId,
        action: 'flagged',
        old_hero_url: listing?.hero_image ?? null,
        new_hero_url: null,
        new_source: null,
      });
      setStats(prev => ({ ...prev, flagged: prev.flagged + 1 }));
    }

    setFlaggedIds(prev => {
      const next = new Set(prev);
      if (alreadyFlagged) next.delete(listingId);
      else next.add(listingId);
      sessionStorage.setItem('heroReviewFlagged', JSON.stringify(Array.from(next)));
      return next;
    });

    setListings(prev =>
      prev.map(l => l.id === listingId ? { ...l, flagged: !alreadyFlagged } : l)
    );
  };

  const navigateFocus = (dir: 1 | -1) => {
    if (listings.length === 0) return;
    const idx = listings.findIndex(l => l.id === focusedId);
    const next = Math.max(0, Math.min(listings.length - 1, idx + dir));
    setFocusedId(listings[next].id);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return {
    listings,
    loading,
    totalCount,
    totalWithHero,
    totalPages,
    page,
    setPage,
    filterSource, setFilterSource,
    filterState, setFilterState,
    searchName, setSearchName,
    showFlaggedOnly, setShowFlaggedOnly,
    expandedId, setExpandedId,
    focusedId, setFocusedId,
    confirmMap,
    stats,
    flaggedIds,
    getReplacements,
    handleReplace,
    handleRemoveHero,
    handleRemoveGalleryPhoto,
    handleFlag,
    navigateFocus,
    reload: loadListings,
  };
}
