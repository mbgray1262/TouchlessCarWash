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
  const [skippedUrls, setSkippedUrls] = useState<string[]>([]);
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

      // Auto-tag existing hero and gallery photos
      for (const c of newCandidates) {
        if (c.source === 'existing' && c.label?.startsWith('Hero')) {
          c.tag = 'hero';
        } else if (c.source === 'existing' && c.label?.startsWith('Gallery')) {
          c.tag = 'gallery';
        }
      }

      // Merge with any pre-loaded candidates (avoid duplicates by URL)
      setCandidates(prev => {
        if (prev.length === 0) return newCandidates;
        const existingUrls = new Set(prev.map(c => c.url));
        const newOnly = newCandidates.filter(c => !existingUrls.has(c.url));
        // Keep pre-loaded items (with user tags), add new discovered ones
        return [...prev, ...newOnly];
      });
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

  // Load existing photos immediately, then discover external sources
  useEffect(() => {
    if (listing && candidates.length === 0 && !discovering) {
      // First: show existing photos instantly from listing data
      const existing: CandidatePhoto[] = [];
      if (listing.hero_image) {
        existing.push({
          id: 'existing-hero',
          url: listing.hero_image,
          source: 'existing',
          label: `Hero (${listing.hero_image_source ?? 'rehosted'})`,
          tag: 'hero' as PhotoTag,
        });
      }
      (listing.photos ?? []).forEach((url, i) => {
        if (url !== listing.hero_image) {
          existing.push({
            id: `existing-gallery-${i}`,
            url,
            source: 'existing',
            label: `Gallery`,
            tag: 'gallery' as PhotoTag,
          });
        }
      });
      if (existing.length > 0) setCandidates(existing);
      // Then: discover external photos (adds to candidates)
      discoverPhotos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.id]);

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
    setCandidates(prev => {
      const galleryCount = prev.filter(c => c.tag === 'gallery').length;
      return prev.map(c => {
        if (c.id === photoId) return { ...c, tag: 'hero' as PhotoTag };
        // Move old hero to gallery (if gallery not full, otherwise to candidates)
        if (c.tag === 'hero') return { ...c, tag: galleryCount < 8 ? 'gallery' as PhotoTag : null };
        return c;
      });
    });
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
    // Remove from candidates and add URL to skipped list for blocked_photos
    setCandidates(prev => {
      const photo = prev.find(c => c.id === photoId);
      if (photo) {
        setSkippedUrls(s => [...s, photo.url]);
      }
      return prev.filter(c => c.id !== photoId);
    });
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
      const t0 = performance.now();
      const heroPhoto = candidates.find(c => c.tag === 'hero');
      const equipPhoto = candidates.find(c => c.tag === 'equipment');
      const galleryPhotos = candidates.filter(c => c.tag === 'gallery');
      // skippedUrls tracks photos removed with X button

      // Only rehost external (non-Supabase) photos
      const toRehost = [heroPhoto, equipPhoto, ...galleryPhotos]
        .filter(Boolean)
        .filter(p => !p!.url.includes('supabase.co')) as CandidatePhoto[];
      const rehostedMap = new Map<string, string>();

      if (toRehost.length > 0) {
        console.log(`[SaveAll] Rehosting ${toRehost.length} external photos...`);
        const results = await Promise.allSettled(
          toRehost.map(async (p) => {
            const url = await rehostPhoto(p);
            rehostedMap.set(p.id, url);
          }),
        );
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
          console.error('Some photos failed to rehost:', failures);
        }
        console.log(`[SaveAll] Rehost done in ${Math.round(performance.now() - t0)}ms`);
      } else {
        console.log('[SaveAll] No external photos to rehost — fast save');
      }

      // Build update payload
      const getUrl = (p: CandidatePhoto | undefined) =>
        p ? (rehostedMap.get(p.id) ?? p.url) : null;

      const heroUrl = getUrl(heroPhoto) ?? listing.hero_image;
      const equipUrl = equipPhoto ? (rehostedMap.get(equipPhoto.id) ?? equipPhoto.url) : null;
      const galleryUrls = galleryPhotos.map(p => rehostedMap.get(p.id) ?? p.url);
      const blockedUrls = [...(listing.blocked_photos ?? []), ...skippedUrls];

      console.log('[SaveAll] hero tagged:', heroPhoto?.id, 'heroUrl:', heroUrl?.slice(0, 80), 'old hero:', listing.hero_image?.slice(0, 80));
      console.log('[SaveAll] gallery:', galleryUrls.length, 'skipped:', skippedUrls.length, 'rehosted:', rehostedMap.size);

      // Combine hero + gallery into photos array (hero first if present)
      // Only include photos that were explicitly tagged — don't carry over untagged old photos
      const allPhotos = new Set<string>();
      if (heroUrl) allPhotos.add(heroUrl);
      for (const url of galleryUrls) allPhotos.add(url);
      // Keep existing gallery photos that are still tagged as gallery
      const taggedGalleryUrls = new Set(galleryUrls);
      const existingGallery = candidates.filter(c => c.source === 'existing' && c.tag === 'gallery');
      for (const p of existingGallery) {
        const url = rehostedMap.get(p.id) ?? p.url;
        allPhotos.add(url);
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

      // Run listing update and audit dismiss in parallel
      const [updateResult] = await Promise.all([
        supabase.from('listings').update(updateData).eq('id', listing.id),
        // Dismiss audit result
        supabase
          .from('photo_audit_results')
          .update({ reviewed: true, applied: true })
          .eq('listing_id', listing.id)
          .eq('reviewed', false),
      ]);

      if (updateResult.error) {
        console.error('[SaveAll] Update failed:', updateResult.error);
        alert(`Save failed: ${updateResult.error.message}`);
        setSaving(false);
        return false;
      }

      // Revalidate page cache (fire-and-forget, don't wait)
      const stateSlug = getStateSlug(listing.state);
      const citySlug = slugify(listing.city);
      fetch('/api/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `/state/${stateSlug}/${citySlug}/${listing.slug}` }),
      }).catch(() => {});

      console.log(`[SaveAll] Total save time: ${Math.round(performance.now() - t0)}ms`);
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
