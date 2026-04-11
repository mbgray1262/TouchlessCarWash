'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { HeroListing, FilterSource, ReplacementOption, SessionStats, EQUIPMENT_MODELS, EQUIPMENT_BRANDS } from './types';
import { autoEnhanceImage } from './autoEnhance';

const DEFAULT_PAGE_SIZE = 20;

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
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [filterSource, setFilterSource] = useState<FilterSource>('all');
  const [filterState, setFilterState] = useState('');
  const [filterVendorId, setFilterVendorId] = useState('');
  const [vendors, setVendors] = useState<{ id: number; name: string }[]>([]);
  const [searchName, setSearchName] = useState('');
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [showNoEquipmentOnly, setShowNoEquipmentOnly] = useState(false);
  const [filterEquipmentBrand, setFilterEquipmentBrand] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [confirmMap, setConfirmMap] = useState<Record<string, number>>({});
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<SessionStats>({ replacements: 0, flagged: 0 });

  const flaggedIdsRef = useRef(flaggedIds);
  flaggedIdsRef.current = flaggedIds;

  useEffect(() => {
    const stored = sessionStorage.getItem('heroReviewFlagged');
    if (stored) {
      try { setFlaggedIds(new Set(JSON.parse(stored))); } catch {}
    }
  }, []);

  // Dynamic brand + model lists: hardcoded defaults merged with custom entries from DB
  const [customBrands, setCustomBrands] = useState<{ value: string; label: string }[]>([]);
  const [customModels, setCustomModels] = useState<Record<string, string[]>>({});

  const loadCustomEntries = useCallback(async () => {
    const { data } = await supabase
      .from('listings')
      .select('equipment_brand, equipment_model')
      .not('equipment_brand', 'is', null)
      .neq('equipment_brand', '__other__');
    if (!data) return;

    // Discover custom brands not in hardcoded list
    const knownBrandValues = new Set(EQUIPMENT_BRANDS.map(b => b.value));
    const seenBrands = new Set<string>();
    const novelBrands: { value: string; label: string }[] = [];
    for (const row of data) {
      const b = row.equipment_brand;
      if (!b || knownBrandValues.has(b) || seenBrands.has(b)) continue;
      seenBrands.add(b);
      // Convert slug back to title case for display
      const label = b.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      novelBrands.push({ value: b, label });
    }
    setCustomBrands(novelBrands.sort((a, b) => a.label.localeCompare(b.label)));

    // Group distinct models by brand
    const byBrand: Record<string, Set<string>> = {};
    for (const row of data) {
      const b = row.equipment_brand;
      const m = row.equipment_model;
      if (!b || !m || m === '__other__') continue;
      if (!byBrand[b]) byBrand[b] = new Set();
      byBrand[b].add(m);
    }

    // Only keep models not already in the hardcoded list
    const extras: Record<string, string[]> = {};
    for (const [brand, models] of Object.entries(byBrand)) {
      const hardcoded = new Set(EQUIPMENT_MODELS[brand] ?? []);
      const novel = Array.from(models).filter(m => !hardcoded.has(m)).sort();
      if (novel.length > 0) extras[brand] = novel;
    }
    setCustomModels(extras);
  }, []);

  /** Merged model list for a brand: hardcoded defaults + any custom models from DB */
  const getModelsForBrand = useCallback((brand: string): string[] => {
    const hardcoded = EQUIPMENT_MODELS[brand] ?? [];
    const custom = customModels[brand] ?? [];
    return [...hardcoded, ...custom];
  }, [customModels]);

  // Load vendor list for dropdown (paginate to get all vendors past Supabase 1000-row default)
  useEffect(() => {
    async function loadAllVendors() {
      const all: { id: number; name: string }[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data } = await supabase
          .from('vendors')
          .select('id, canonical_name')
          .order('canonical_name')
          .range(offset, offset + batchSize - 1);
        if (data && data.length > 0) {
          all.push(...data.filter(v => v.canonical_name).map(v => ({ id: v.id, name: v.canonical_name })));
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      setVendors(all);
    }
    loadAllVendors();
  }, []);

  // Load custom models on mount
  useEffect(() => {
    loadCustomEntries();
  }, [loadCustomEntries]);

  const buildQuery = useCallback(() => {
    let q = supabase
      .from('listings')
      .select('id, name, address, city, state, slug, hero_image, hero_image_source, parent_chain, photos, google_photo_url, street_view_url, website, photo_enrichment_attempted_at, google_place_id, equipment_brand, equipment_model', { count: 'exact' })
      .eq('is_touchless', true)
      .neq('hero_image_source', 'chain_brand')
      .order('photo_enrichment_attempted_at', { ascending: false, nullsFirst: false });

    if (filterSource === 'none') {
      q = q.is('hero_image', null);
    } else if (filterSource !== 'all') {
      q = q.eq('hero_image_source', filterSource);
    }

    if (filterState) q = q.eq('state', filterState);
    if (filterVendorId) q = q.eq('vendor_id', parseInt(filterVendorId, 10));
    if (searchName) q = q.ilike('name', `%${searchName}%`);
    if (showNoEquipmentOnly) q = q.is('equipment_brand', null);
    if (filterEquipmentBrand) q = q.eq('equipment_brand', filterEquipmentBrand);

    return q;
  }, [filterSource, filterState, filterVendorId, searchName, showNoEquipmentOnly, filterEquipmentBrand]);

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error } = await buildQuery().range(from, to);
      if (error) throw error;

      const items: HeroListing[] = (data ?? []).map((r) => ({
        ...r,
        hero_image_source: r.hero_image_source as HeroListing['hero_image_source'],
        parent_chain: r.parent_chain ?? null,
        flagged: flaggedIdsRef.current.has(r.id),
      }));

      const filtered = showFlaggedOnly ? items.filter(i => i.flagged) : items;
      setListings(filtered);
      setTotalCount(count ?? 0);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, buildQuery, showFlaggedOnly]);

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

  const handleEnhanceHero = async (listingId: string, imageUrl: string) => {
    const listing = listings.find(l => l.id === listingId);

    const blob = await autoEnhanceImage(imageUrl);
    const formData = new FormData();
    formData.append('file', blob, 'enhanced-hero.jpg');
    formData.append('listingId', listingId);
    formData.append('type', 'hero');

    const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
    if (!res.ok) throw new Error(await res.text());
    const { url } = await res.json() as { url: string };

    await supabase
      .from('listings')
      .update({ hero_image: url, hero_image_source: 'gallery' })
      .eq('id', listingId);

    await supabase.from('hero_reviews').insert({
      listing_id: listingId,
      action: 'replaced',
      old_hero_url: imageUrl,
      new_hero_url: url,
      new_source: 'gallery',
    });

    setListings(prev =>
      prev.map(l => l.id === listingId
        ? { ...l, hero_image: url, hero_image_source: 'gallery' as HeroListing['hero_image_source'] }
        : l
      )
    );
    revalidateListing(listing);
  };

  /** Enhance a photo in-place without changing which image is the hero. */
  const handleEnhancePhoto = async (listingId: string, imageUrl: string) => {
    const listing = listings.find(l => l.id === listingId);

    const blob = await autoEnhanceImage(imageUrl);
    const formData = new FormData();
    formData.append('file', blob, 'enhanced-photo.jpg');
    formData.append('listingId', listingId);
    formData.append('type', 'hero');

    const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
    if (!res.ok) throw new Error(await res.text());
    const { url: newUrl } = await res.json() as { url: string };

    // Build DB updates: swap the old URL for the new one everywhere it appears
    const updates: Record<string, unknown> = {};
    const currentPhotos = listing?.photos ?? [];
    if (currentPhotos.includes(imageUrl)) {
      updates.photos = currentPhotos.map(p => p === imageUrl ? newUrl : p);
    }
    if (listing?.google_photo_url === imageUrl) updates.google_photo_url = newUrl;
    if (listing?.street_view_url === imageUrl) updates.street_view_url = newUrl;
    if (listing?.hero_image === imageUrl) {
      updates.hero_image = newUrl;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('listings').update(updates).eq('id', listingId);
    }

    // Update local state
    setListings(prev =>
      prev.map(l => {
        if (l.id !== listingId) return l;
        const patched = { ...l };
        if (updates.photos) patched.photos = updates.photos as string[];
        if (updates.google_photo_url !== undefined) patched.google_photo_url = newUrl;
        if (updates.street_view_url !== undefined) patched.street_view_url = newUrl;
        if (updates.hero_image !== undefined) patched.hero_image = newUrl;
        return patched;
      })
    );

    if (listing?.hero_image === imageUrl) revalidateListing(listing);
  };

  /** Revert a hero image back to a previous URL (used for enhance toggle-off). */
  const handleRevertEnhance = async (listingId: string, originalUrl: string, originalSource: string | null) => {
    const listing = listings.find(l => l.id === listingId);

    await supabase
      .from('listings')
      .update({ hero_image: originalUrl, hero_image_source: originalSource })
      .eq('id', listingId);

    setListings(prev =>
      prev.map(l => l.id === listingId
        ? { ...l, hero_image: originalUrl, hero_image_source: (originalSource ?? null) as HeroListing['hero_image_source'] }
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

  const handleSetEquipment = async (listingId: string, brand: string | null, model: string | null) => {
    const listing = listings.find(l => l.id === listingId);
    await supabase
      .from('listings')
      .update({ equipment_brand: brand, equipment_model: model })
      .eq('id', listingId);

    setListings(prev =>
      prev.map(l => l.id === listingId
        ? { ...l, equipment_brand: brand, equipment_model: model }
        : l
      )
    );
    revalidateListing(listing);

    // Optimistically add custom brand/model to local state so they appear immediately
    if (brand && brand !== '__other__') {
      const knownBrandValues = new Set<string>(EQUIPMENT_BRANDS.map(b => b.value));
      if (!knownBrandValues.has(brand) && !customBrands.some(b => b.value === brand)) {
        const label = brand.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        setCustomBrands(prev => [...prev, { value: brand, label }].sort((a, b) => a.label.localeCompare(b.label)));
      }
    }
    if (model && model !== '__other__' && brand) {
      const hardcoded = EQUIPMENT_MODELS[brand] ?? [];
      if (!hardcoded.includes(model)) {
        setCustomModels(prev => {
          const existing = prev[brand] ?? [];
          if (existing.includes(model)) return prev;
          return { ...prev, [brand]: [...existing, model].sort() };
        });
      }
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(listings.map(l => l.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBatchSetEquipment = async (ids: string[], brand: string | null, model: string | null) => {
    if (ids.length === 0) return;

    await supabase
      .from('listings')
      .update({ equipment_brand: brand, equipment_model: model })
      .in('id', ids);

    const idSet = new Set(ids);
    setListings(prev =>
      prev.map(l => idSet.has(l.id)
        ? { ...l, equipment_brand: brand, equipment_model: model }
        : l
      )
    );
    setSelectedIds(new Set());

    // Optimistically add custom brand/model
    if (brand && brand !== '__other__') {
      const knownBrandValues = new Set<string>(EQUIPMENT_BRANDS.map(b => b.value));
      if (!knownBrandValues.has(brand) && !customBrands.some(b => b.value === brand)) {
        const label = brand.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        setCustomBrands(prev => [...prev, { value: brand, label }].sort((a, b) => a.label.localeCompare(b.label)));
      }
    }
    if (model && model !== '__other__' && brand) {
      const hardcoded = EQUIPMENT_MODELS[brand] ?? [];
      if (!hardcoded.includes(model)) {
        setCustomModels(prev => {
          const existing = prev[brand] ?? [];
          if (existing.includes(model)) return prev;
          return { ...prev, [brand]: [...existing, model].sort() };
        });
      }
    }
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

  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    listings,
    loading,
    totalCount,
    totalWithHero,
    totalPages,
    page,
    setPage,
    pageSize,
    setPageSize,
    filterSource, setFilterSource,
    filterState, setFilterState,
    filterVendorId, setFilterVendorId,
    vendors,
    searchName, setSearchName,
    showFlaggedOnly, setShowFlaggedOnly,
    showNoEquipmentOnly, setShowNoEquipmentOnly,
    filterEquipmentBrand, setFilterEquipmentBrand,
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
    handleEnhanceHero,
    handleEnhancePhoto,
    handleRevertEnhance,
    handleUploadHero,
    handleMarkNotTouchless,
    handleSetEquipment,
    handleBatchSetEquipment,
    getModelsForBrand,
    customBrands,
    handleFlag,
    navigateFocus,
    selectedIds,
    toggleSelected,
    selectAllVisible,
    clearSelection,
    reload: loadListings,
  };
}
