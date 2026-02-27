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
      .select('id, name, city, state, hero_image, hero_image_source, photos, google_photo_url, street_view_url, website, photo_enrichment_attempted_at', { count: 'exact' })
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

    add(listing.google_photo_url, 'Google', 'google');
    add(listing.street_view_url, 'Street View', 'street_view');

    return opts;
  };

  const handleReplace = async (listingId: string, url: string | null, source: string, optIdx: number) => {
    const listing = listings.find(l => l.id === listingId);
    const oldHero = listing?.hero_image ?? null;

    setConfirmMap(prev => ({ ...prev, [listingId]: optIdx }));

    const currentPhotos = listing?.photos ?? [];
    const updatedPhotos = oldHero && !currentPhotos.includes(oldHero)
      ? [oldHero, ...currentPhotos]
      : currentPhotos;

    await supabase
      .from('listings')
      .update({
        hero_image: url,
        hero_image_source: url ? source : null,
        photos: updatedPhotos.length > 0 ? updatedPhotos : null,
      })
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
        ? {
            ...l,
            hero_image: url,
            hero_image_source: (url ? source : null) as HeroListing['hero_image_source'],
            photos: updatedPhotos.length > 0 ? updatedPhotos : null,
          }
        : l
      )
    );

    setStats(prev => ({ ...prev, replacements: prev.replacements + 1 }));

    setTimeout(() => {
      setConfirmMap(prev => { const n = { ...prev }; delete n[listingId]; return n; });
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

  const handleDeleteExternalPhoto = async (listingId: string, field: 'google_photo_url' | 'street_view_url') => {
    await supabase.from('listings').update({ [field]: null }).eq('id', listingId);
    setListings(prev => prev.map(l => l.id === listingId ? { ...l, [field]: null } : l));
  };

  const handleDeleteHeroPhoto = async (listingId: string) => {
    const listing = listings.find(l => l.id === listingId);
    const heroUrl = listing?.hero_image ?? null;
    if (!heroUrl) return;

    const { data: current } = await supabase
      .from('listings').select('blocked_photos').eq('id', listingId).maybeSingle();

    const blocked = (current?.blocked_photos as string[] | null) ?? [];
    const newBlocked = blocked.includes(heroUrl) ? blocked : [heroUrl, ...blocked];

    const updates: Record<string, unknown> = {
      hero_image: null,
      hero_image_source: null,
      blocked_photos: newBlocked,
    };
    if (listing?.google_photo_url === heroUrl) updates.google_photo_url = null;
    if (listing?.street_view_url === heroUrl) updates.street_view_url = null;

    await supabase.from('listings').update(updates).eq('id', listingId);

    setListings(prev => prev.map(l => {
      if (l.id !== listingId) return l;
      return {
        ...l,
        hero_image: null,
        hero_image_source: null,
        google_photo_url: l.google_photo_url === heroUrl ? null : l.google_photo_url,
        street_view_url: l.street_view_url === heroUrl ? null : l.street_view_url,
      };
    }));
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

  const handleCropSave = async (listingId: string, croppedUrl: string) => {
    await supabase
      .from('listings')
      .update({ hero_image: croppedUrl, hero_image_source: 'gallery' })
      .eq('id', listingId);

    setListings(prev =>
      prev.map(l => l.id === listingId
        ? { ...l, hero_image: croppedUrl, hero_image_source: 'gallery' }
        : l
      )
    );
  };

  const handleUploadHero = async (listingId: string, file: File) => {
    const listing = listings.find(l => l.id === listingId);
    const oldHero = listing?.hero_image ?? null;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('listingId', listingId);
    formData.append('type', 'hero');

    const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
    if (!res.ok) return;
    const { url } = await res.json() as { url: string };

    const currentPhotos = listing?.photos ?? [];
    const updatedPhotos = oldHero && !currentPhotos.includes(oldHero)
      ? [oldHero, ...currentPhotos]
      : currentPhotos;

    await supabase
      .from('listings')
      .update({
        hero_image: url,
        hero_image_source: 'gallery',
        photos: updatedPhotos.length > 0 ? updatedPhotos : null,
      })
      .eq('id', listingId);

    await supabase.from('hero_reviews').insert({
      listing_id: listingId,
      action: 'replaced',
      old_hero_url: oldHero,
      new_hero_url: url,
      new_source: 'gallery',
    });

    setListings(prev =>
      prev.map(l => l.id === listingId
        ? {
            ...l,
            hero_image: url,
            hero_image_source: 'gallery' as HeroListing['hero_image_source'],
            photos: updatedPhotos.length > 0 ? updatedPhotos : null,
          }
        : l
      )
    );

    setStats(prev => ({ ...prev, replacements: prev.replacements + 1 }));
  };

  const handleMarkNotTouchless = async (listingId: string) => {
    await supabase
      .from('listings')
      .update({ is_touchless: false })
      .eq('id', listingId);

    setListings(prev => prev.filter(l => l.id !== listingId));
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
    handleDeleteHeroPhoto,
    handleDeleteExternalPhoto,
    handleRemoveGalleryPhoto,
    handleCropSave,
    handleUploadHero,
    handleMarkNotTouchless,
    handleFlag,
    navigateFocus,
    reload: loadListings,
  };
}
