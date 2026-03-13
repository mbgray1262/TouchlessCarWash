'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { HeroListing, FilterSource, ReplacementOption, SessionStats } from './types';

const PAGE_SIZE = 20;

/** Purge CDN cache for a listing's detail page so changes appear immediately. */
async function revalidateListing(listing: HeroListing | undefined) {
  if (!listing?.slug) return;
  const path = `/state/${getStateSlug(listing.state)}/${slugify(listing.city)}/${listing.slug}`;
  try {
    await fetch('/api/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
  } catch {
    // Revalidation failed — page will still update within 60s via CDN TTL
  }
}

export function useHeroReview() {
  const [listings, setListings] = useState<HeroListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [totalWithHero, setTotalWithHero] = useState(0);
  const [page, setPage] = useState(0);

  const [filterSource, setFilterSource] = useState<FilterSource>('all');
  const [filterState, setFilterState] = useState('');
  const [filterVendorId, setFilterVendorId] = useState('');
  const [vendors, setVendors] = useState<{ id: number; name: string }[]>([]);
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

  // Load vendor list for dropdown
  useEffect(() => {
    supabase
      .from('vendors')
      .select('id, canonical_name')
      .order('canonical_name')
      .then(({ data }) => {
        if (data) {
          setVendors(data.map(v => ({ id: v.id, name: v.canonical_name })));
        }
      });
  }, []);

  const buildQuery = useCallback(() => {
    let q = supabase
      .from('listings')
      .select('id, name, address, city, state, slug, hero_image, hero_image_source, photos, google_photo_url, street_view_url, website, photo_enrichment_attempted_at', { count: 'exact' })
      .eq('is_touchless', true)
      .order('photo_enrichment_attempted_at', { ascending: false, nullsFirst: false });

    if (filterSource === 'none') {
      q = q.is('hero_image', null);
    } else if (filterSource !== 'all') {
      q = q.eq('hero_image_source', filterSource);
    }

    if (filterState) q = q.eq('state', filterState);
    if (filterVendorId) q = q.eq('vendor_id', parseInt(filterVendorId, 10));
    if (searchName) q = q.ilike('name', `%${searchName}%`);

    return q;
  }, [filterSource, filterState, filterVendorId, searchName]);

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
    const seenBases = new Set<string>();

    // Normalize to catch same image at different resolutions (w800 vs w1600)
    const normalize = (url: string) => url.replace(/=[whs]\d+(?:-[a-z0-9]+)*$/, '');

    const add = (url: string | null, label: string, source: string) => {
      if (!url) return;
      const base = normalize(url);
      if (seenBases.has(base) || url === listing.hero_image) return;
      seenBases.add(base);
      opts.push({ url, label, source });
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
    // Preserve the old hero in photos if not already there
    let updatedPhotos = oldHero && !currentPhotos.includes(oldHero)
      ? [oldHero, ...currentPhotos]
      : [...currentPhotos];
    // Also ensure the new hero is in photos (so it appears in gallery)
    if (url && !updatedPhotos.includes(url)) {
      updatedPhotos = [url, ...updatedPhotos];
    }

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
    revalidateListing(listing);

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
    revalidateListing(listing);
  };

  const handleDeleteExternalPhoto = async (listingId: string, field: 'google_photo_url' | 'street_view_url') => {
    const listing = listings.find(l => l.id === listingId);
    await supabase.from('listings').update({ [field]: null }).eq('id', listingId);
    setListings(prev => prev.map(l => l.id === listingId ? { ...l, [field]: null } : l));
    revalidateListing(listing);
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
    revalidateListing(listing);
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
    revalidateListing(listing);
  };

  const handleCropSave = async (listingId: string, croppedUrl: string) => {
    const listing = listings.find(l => l.id === listingId);
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
    revalidateListing(listing);
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
    // Preserve the old hero in photos if not already there
    let updatedPhotos = oldHero && !currentPhotos.includes(oldHero)
      ? [oldHero, ...currentPhotos]
      : [...currentPhotos];
    // Also ensure the new uploaded image is in photos (so it appears in gallery)
    if (!updatedPhotos.includes(url)) {
      updatedPhotos = [url, ...updatedPhotos];
    }

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
    revalidateListing(listing);
  };

  const handleMarkNotTouchless = async (listingId: string) => {
    const listing = listings.find(l => l.id === listingId);
    await supabase
      .from('listings')
      .update({ is_touchless: false })
      .eq('id', listingId);

    setListings(prev => prev.filter(l => l.id !== listingId));
    revalidateListing(listing);
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
    filterVendorId, setFilterVendorId,
    vendors,
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
