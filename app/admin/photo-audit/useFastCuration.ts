'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';

export type PhotoTag = 'hero' | 'gallery' | 'equipment' | 'skip' | null;
export type PhotoSource = 'google_places' | 'google_search' | 'website' | 'street_view' | 'existing' | 'capture' | 'upload';

export interface CandidatePhoto {
  id: string;
  url: string;
  source: PhotoSource;
  label?: string;
  googlePhotoName?: string;
  streetviewPano?: string;
  tag: PhotoTag;
  width?: number;
  height?: number;
}

interface ListingData {
  id: string;
  name: string;
  city: string;
  state: string;
  slug: string;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  website: string | null;
  hero_image: string | null;
  hero_image_source: string | null;
  photos: string[] | null;
  street_view_url: string | null;
  blocked_photos: string[] | null;
  equipment_brand: string | null;
  equipment_model: string | null;
  equipment_photo?: string | null;
}

interface SourceCounts {
  existing: number;
  google_places: number;
  google_search: number;
  website: number;
  street_view: number;
}

export function useFastCuration(listingId: string) {
  const [listing, setListing] = useState<ListingData | null>(null);
  const [candidates, setCandidates] = useState<CandidatePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sourceCounts, setSourceCounts] = useState<SourceCounts | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [classifyResult, setClassifyResult] = useState<string | null>(null);
  const [classifyEvidence, setClassifyEvidence] = useState<string | null>(null);
  const prevListingId = useRef<string | null>(null);

  // Load listing data
  const loadListing = useCallback(async () => {
    const { data } = await supabase
      .from('listings')
      .select('id, name, city, state, slug, latitude, longitude, google_place_id, website, hero_image, hero_image_source, photos, street_view_url, blocked_photos, equipment_brand, equipment_model')
      .eq('id', listingId)
      .maybeSingle();
    if (data) setListing(data as ListingData);
    setLoading(false);
  }, [listingId]);

  // Discover photos from all sources
  const discoverPhotos = useCallback(async () => {
    setDiscovering(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${supabaseUrl}/functions/v1/photo-discover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ listing_id: listingId }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const newCandidates: CandidatePhoto[] = (data.candidates ?? []).map(
        (c: { url: string; source: PhotoSource; label?: string; googlePhotoName?: string; streetviewPano?: string; width?: number; height?: number }, i: number) => ({
          id: `photo-${i}-${Date.now()}`,
          url: c.url,
          source: c.source,
          label: c.label,
          googlePhotoName: c.googlePhotoName,
          streetviewPano: c.streetviewPano,
          tag: null as PhotoTag,
          width: c.width,
          height: c.height,
        }),
      );

      // Auto-tag existing hero
      for (const c of newCandidates) {
        if (c.source === 'existing' && c.label?.startsWith('Hero')) {
          c.tag = 'hero';
        }
      }

      setCandidates(newCandidates);
      setSourceCounts(data.sources);
    } catch (err) {
      console.error('Photo discovery failed:', err);
    } finally {
      setDiscovering(false);
    }
  }, [listingId]);

  // Reset and load on listingId change
  useEffect(() => {
    if (listingId !== prevListingId.current) {
      prevListingId.current = listingId;
      setCandidates([]);
      setSourceCounts(null);
      setSelectedId(null);
      setClassifyResult(null);
      setClassifyEvidence(null);
      setSaving(false);
      setLoading(true);
      loadListing();
    }
  }, [listingId, loadListing]);

  // Auto-discover after listing loads
  useEffect(() => {
    if (listing && candidates.length === 0 && !discovering) {
      discoverPhotos();
    }
  }, [listing, candidates.length, discovering, discoverPhotos]);

  // Tag a photo (enforces single hero / single equipment)
  const tagPhoto = useCallback((photoId: string, tag: PhotoTag) => {
    setCandidates(prev => prev.map(c => {
      if (c.id === photoId) {
        // Toggle: if same tag, remove it
        return { ...c, tag: c.tag === tag ? null : tag };
      }
      // Enforce single hero / single equipment
      if (tag === 'hero' && c.tag === 'hero') return { ...c, tag: null };
      if (tag === 'equipment' && c.tag === 'equipment') return { ...c, tag: null };
      return c;
    }));
  }, []);

  // WYSIWYG helpers
  const setAsHero = useCallback((photoId: string) => {
    setCandidates(prev => prev.map(c => {
      if (c.id === photoId) return { ...c, tag: 'hero' as PhotoTag };
      if (c.tag === 'hero') return { ...c, tag: null }; // clear old hero
      return c;
    }));
  }, []);

  const addToGallery = useCallback((photoId: string) => {
    setCandidates(prev => {
      const galleryCount = prev.filter(c => c.tag === 'gallery').length;
      if (galleryCount >= 8) return prev; // max 8 gallery photos
      return prev.map(c => c.id === photoId ? { ...c, tag: 'gallery' as PhotoTag } : c);
    });
  }, []);

  const removeFromGallery = useCallback((photoId: string) => {
    setCandidates(prev => prev.map(c =>
      c.id === photoId && c.tag === 'gallery' ? { ...c, tag: null } : c,
    ));
  }, []);

  const removeHero = useCallback(() => {
    setCandidates(prev => prev.map(c =>
      c.tag === 'hero' ? { ...c, tag: null } : c,
    ));
  }, []);

  const skipPhoto = useCallback((photoId: string) => {
    setCandidates(prev => prev.map(c =>
      c.id === photoId ? { ...c, tag: 'skip' as PhotoTag } : c,
    ));
  }, []);

  // Add a captured street view photo
  const addCapture = useCallback((panoId: string, heading: number, url: string) => {
    const newPhoto: CandidatePhoto = {
      id: `capture-${Date.now()}`,
      url,
      source: 'capture',
      label: `Street View (${Math.round(heading)}°)`,
      streetviewPano: `${panoId}:${heading}`,
      tag: null,
    };
    setCandidates(prev => [...prev, newPhoto]);
  }, []);

  // Add an uploaded/pasted photo
  const addUpload = useCallback((url: string) => {
    const newPhoto: CandidatePhoto = {
      id: `upload-${Date.now()}`,
      url,
      source: 'upload',
      label: 'Uploaded',
      tag: null,
    };
    setCandidates(prev => [...prev, newPhoto]);
  }, []);

  // Replace a candidate URL (after crop/enhance)
  const replaceUrl = useCallback((photoId: string, newUrl: string) => {
    setCandidates(prev => prev.map(c =>
      c.id === photoId ? { ...c, url: newUrl } : c,
    ));
  }, []);

  // Rehost a single external photo to Supabase storage
  const rehostPhoto = async (photo: CandidatePhoto): Promise<string> => {
    // Already hosted on Supabase
    if (photo.url.includes('supabase.co')) return photo.url;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const body: Record<string, unknown> = {
      listing_id: listing!.id,
      set_as_hero: false,
    };

    if (photo.googlePhotoName) {
      body.photo_name = photo.googlePhotoName;
    } else if (photo.streetviewPano) {
      body.photo_url = `streetview:${photo.streetviewPano}`;
    } else {
      body.photo_url = photo.url;
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/google-place-photos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`Rehost failed: ${res.status}`);
    const data = await res.json();
    return data.url;
  };

  // Save all tags and advance
  const saveAll = async (): Promise<boolean> => {
    if (!listing || saving) return false;
    setSaving(true);

    try {
      const heroPhoto = candidates.find(c => c.tag === 'hero');
      const equipPhoto = candidates.find(c => c.tag === 'equipment');
      const galleryPhotos = candidates.filter(c => c.tag === 'gallery');
      const skipPhotos = candidates.filter(c => c.tag === 'skip');

      // Rehost all tagged external photos in parallel
      const toRehost = [heroPhoto, equipPhoto, ...galleryPhotos].filter(Boolean) as CandidatePhoto[];
      const rehostedMap = new Map<string, string>();

      const results = await Promise.allSettled(
        toRehost.map(async (p) => {
          const url = await rehostPhoto(p);
          rehostedMap.set(p.id, url);
        }),
      );

      // Check for failures
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        console.error('Some photos failed to rehost:', failures);
      }

      // Build update payload
      const getUrl = (p: CandidatePhoto | undefined) =>
        p ? (rehostedMap.get(p.id) ?? p.url) : null;

      const heroUrl = getUrl(heroPhoto) ?? listing.hero_image;
      const equipUrl = equipPhoto ? (rehostedMap.get(equipPhoto.id) ?? equipPhoto.url) : null;
      const galleryUrls = galleryPhotos.map(p => rehostedMap.get(p.id) ?? p.url);
      const blockedUrls = [...(listing.blocked_photos ?? []), ...skipPhotos.map(p => p.url)];

      console.log('[SaveAll] hero tagged:', heroPhoto?.id, 'heroUrl:', heroUrl?.slice(0, 80), 'old hero:', listing.hero_image?.slice(0, 80));
      console.log('[SaveAll] gallery:', galleryUrls.length, 'skip:', skipPhotos.length, 'rehosted:', rehostedMap.size, 'failures:', failures.length);

      // Combine hero + gallery into photos array (hero first if present)
      const allPhotos = new Set<string>();
      if (heroUrl) allPhotos.add(heroUrl);
      for (const url of galleryUrls) allPhotos.add(url);
      // Keep existing gallery photos that weren't explicitly skipped
      for (const url of (listing.photos ?? [])) {
        if (!blockedUrls.includes(url)) allPhotos.add(url);
      }

      const updateData: Record<string, unknown> = {
        hero_image: heroUrl,
        photos: Array.from(allPhotos),
        blocked_photos: blockedUrls,
      };

      if (heroPhoto) {
        updateData.hero_image_source = heroPhoto.source === 'google_places' ? 'google' :
          heroPhoto.source === 'capture' ? 'street_view' : heroPhoto.source;
      }

      // equipment_photo column doesn't exist yet — store in classification_source for now
      // TODO: add equipment_photo column to listings table if needed

      const { error: updateError } = await supabase.from('listings').update(updateData).eq('id', listing.id);
      if (updateError) {
        console.error('[SaveAll] Update failed:', updateError);
        alert(`Save failed: ${updateError.message}`);
        setSaving(false);
        return false;
      }

      // Dismiss audit result
      const { data: auditRows } = await supabase
        .from('photo_audit_results')
        .select('id')
        .eq('listing_id', listing.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (auditRows && auditRows.length > 0) {
        await supabase
          .from('photo_audit_results')
          .update({ reviewed: true, applied: true })
          .eq('id', auditRows[0].id);
      }

      // Revalidate page cache
      const stateSlug = getStateSlug(listing.state);
      const citySlug = slugify(listing.city);
      try {
        await fetch('/api/revalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: `/state/${stateSlug}/${citySlug}/${listing.slug}` }),
        });
      } catch {}

      return true;
    } catch (err) {
      console.error('Save failed:', err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Classify equipment using AI
  const classifyEquipment = useCallback(async () => {
    if (!listing || classifying) return;
    setClassifying(true);
    setClassifyResult(null);
    setClassifyEvidence(null);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${supabaseUrl}/functions/v1/detect-equipment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ listing_id: listingId }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.detection) {
        setClassifyResult(`${data.detection.brand}/${data.detection.model ?? 'Unknown'} (${data.detection.confidence})`);
        setClassifyEvidence(data.detection.raw_text ?? data.diagnostics?.[0]?.raw_ai_response ?? null);
        if (data.saved) await loadListing();
      } else {
        setClassifyResult('No equipment detected');
        setClassifyEvidence(data.diagnostics?.[0]?.raw_ai_response ?? null);
      }
    } catch (err) {
      setClassifyResult('Classification failed');
    } finally {
      setClassifying(false);
    }
  }, [listing, classifying, listingId, loadListing]);

  // Mark as not touchless
  const markNotTouchless = useCallback(async () => {
    if (!listing) return;
    setSaving(true);
    await supabase.from('listings').update({ is_touchless: false }).eq('id', listing.id);
    await supabase.from('photo_audit_results').update({ reviewed: true, applied: true }).eq('listing_id', listing.id);
    setSaving(false);
  }, [listing]);

  // Delete listing
  const deleteListing = useCallback(async () => {
    if (!listing) return;
    setSaving(true);
    await supabase.from('photo_audit_results').update({ reviewed: true, applied: true }).eq('listing_id', listing.id);
    await supabase.from('listings').delete().eq('id', listing.id);
    setSaving(false);
  }, [listing]);

  return {
    listing,
    loading,
    candidates,
    discovering,
    saving,
    sourceCounts,
    selectedId,
    setSelectedId,
    classifying,
    classifyResult,
    classifyEvidence,
    tagPhoto,
    setAsHero,
    addToGallery,
    removeFromGallery,
    removeHero,
    skipPhoto,
    addCapture,
    addUpload,
    replaceUrl,
    saveAll,
    discoverPhotos,
    classifyEquipment,
    markNotTouchless,
    deleteListing,
    loadListing,
  };
}
