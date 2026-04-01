'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';

export type PhotoTag = 'hero' | 'gallery' | 'equipment' | 'skip' | null;
export type PhotoSource = 'google_places' | 'google_maps' | 'google_search' | 'bing_search' | 'website' | 'street_view' | 'existing' | 'capture' | 'upload';

export interface CandidatePhoto {
  id: string;
  url: string;
  fullResUrl?: string;
  sourceUrl?: string;
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
  google_photo_url: string | null;
  blocked_photos: string[] | null;
  equipment_brand: string | null;
  equipment_model: string | null;
  equipment_photo?: string | null;
  touchless_verified: string | null;
  touchless_evidence: string | null;
  parent_chain: string | null;
}

interface SourceCounts {
  existing: number;
  yelp: number;
  google_maps: number;
  google_places: number;
  google_search: number;
  bing_search: number;
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
      .select('id, name, city, state, slug, latitude, longitude, google_place_id, website, hero_image, hero_image_source, photos, street_view_url, google_photo_url, blocked_photos, equipment_brand, equipment_model, touchless_verified, touchless_evidence, parent_chain')
      .eq('id', listingId)
      .maybeSingle();
    if (data) {
      // Clean up broken gallery images on load
      const photos = (data.photos as string[] | null) ?? [];
      if (photos.length > 0) {
        const validPhotos: string[] = [];
        const broken: string[] = [];
        await Promise.all(photos.map(async (url: string) => {
          try {
            const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
            if (!r.ok) { broken.push(url); return; }
            const contentType = r.headers.get('content-type') || '';
            const contentLength = parseInt(r.headers.get('content-length') || '0', 10);
            // Remove non-images and tiny files (<5KB = likely icons/placeholders)
            if (!contentType.startsWith('image/') || (contentLength > 0 && contentLength < 5000)) {
              broken.push(url);
            } else {
              validPhotos.push(url);
            }
          } catch {
            broken.push(url);
          }
        }));
        if (broken.length > 0) {
          // Remove broken photos from DB
          await supabase.from('listings').update({ photos: validPhotos }).eq('id', data.id);
          data.photos = validPhotos;
          console.log(`Cleaned ${broken.length} broken gallery photos from ${data.name}`);
        }
      }
      // Also check hero image
      if (data.hero_image) {
        try {
          const r = await fetch(data.hero_image, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
          if (!r.ok) {
            await supabase.from('listings').update({ hero_image: null, hero_image_source: null }).eq('id', data.id);
            data.hero_image = null;
            data.hero_image_source = null;
            console.log(`Cleaned broken hero image from ${data.name}`);
          }
        } catch {
          await supabase.from('listings').update({ hero_image: null, hero_image_source: null }).eq('id', data.id);
          data.hero_image = null;
          data.hero_image_source = null;
          console.log(`Cleaned broken hero image from ${data.name}`);
        }
      }
      setListing(data as ListingData);
    }
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
        (c: { url: string; fullResUrl?: string; sourceUrl?: string; source: PhotoSource; label?: string; googlePhotoName?: string; streetviewPano?: string; width?: number; height?: number }, i: number) => ({
          id: `photo-${i}-${Date.now()}`,
          url: c.url,
          fullResUrl: c.fullResUrl,
          sourceUrl: c.sourceUrl,
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

      // Pre-validate image URLs: probe each non-existing image to filter out broken/tiny ones
      const validatedCandidates = await Promise.all(
        newCandidates.map(async (c) => {
          // Always keep existing photos (they're already in the DB)
          if (c.source === 'existing') return c;
          try {
            const valid = await new Promise<boolean>((resolve) => {
              const img = new window.Image();
              img.referrerPolicy = 'no-referrer';
              img.onload = () => {
                // Reject tiny images (icons, spacers, tracking pixels)
                resolve(img.naturalWidth >= 100 && img.naturalHeight >= 100);
              };
              img.onerror = () => resolve(false);
              // Timeout after 5 seconds
              setTimeout(() => resolve(false), 5000);
              img.src = c.url;
            });
            return valid ? c : null;
          } catch {
            return null;
          }
        })
      );
      const filteredCandidates = validatedCandidates.filter((c): c is CandidatePhoto => c !== null);

      // Merge with any pre-loaded candidates (avoid duplicates by URL)
      setCandidates(prev => {
        if (prev.length === 0) return filteredCandidates;
        const existingUrls = new Set(prev.map(c => c.url));
        const newOnly = filteredCandidates.filter(c => !existingUrls.has(c.url));
        // Keep pre-loaded items (with user tags), add new discovered ones
        return [...prev, ...newOnly];
      });

      // Report VALID candidate counts per source (not raw server counts which include
      // broken/tiny images that were filtered out by the frontend validation step).
      const validCounts = { ...data.sources };
      validCounts.google_maps    = filteredCandidates.filter(c => c.source === 'google_maps').length;
      validCounts.google_places  = filteredCandidates.filter(c => c.source === 'google_places').length;
      validCounts.bing_search    = filteredCandidates.filter(c => c.source === 'bing_search').length;
      validCounts.website        = filteredCandidates.filter(c => c.source === 'website').length;
      validCounts.street_view    = filteredCandidates.filter(c => c.source === 'street_view' || c.source === 'capture').length;
      setSourceCounts(validCounts);
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
      setListing(null);       // Clear stale listing to prevent old hero from flashing
      setCandidates([]);
      setSkippedUrls([]);
      setSourceCounts(null);
      setSelectedId(null);
      setClassifyResult(null);
      setClassifyEvidence(null);
      setSaving(false);
      setDiscovering(false);
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
      // Also show google_photo_url and street_view_url as untagged candidates so the user
      // can see them — the public listing page always appends these to the gallery, so
      // they'd show as "surprise" photos if not shown here.
      const existingUrls = new Set([listing.hero_image, ...(listing.photos ?? [])].filter(Boolean));
      if (listing.google_photo_url && !existingUrls.has(listing.google_photo_url)) {
        existing.push({
          id: 'existing-google-photo',
          url: listing.google_photo_url,
          source: 'existing',
          label: 'Google photo (auto)',
          tag: null,
        });
      }
      if (listing.street_view_url && !existingUrls.has(listing.street_view_url)) {
        existing.push({
          id: 'existing-street-view',
          url: listing.street_view_url,
          source: 'existing',
          label: 'Street view (auto)',
          tag: null,
        });
      }
      if (existing.length > 0) setCandidates(existing);
      // External photo discovery (Google Places API, Yelp, etc.) is NOT triggered
      // automatically — user must click "Google Photos" to avoid unexpected API costs.
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

  // Add a photo directly as hero (for drag-and-drop / upload hero shortcut)
  const addHeroDirect = useCallback((url: string) => {
    const newPhoto: CandidatePhoto = {
      id: `hero-drop-${Date.now()}`,
      url,
      source: 'upload',
      label: 'Street View Upload',
      tag: 'hero' as PhotoTag,
    };
    setCandidates(prev => {
      // Demote any existing hero to gallery
      const galleryCount = prev.filter(c => c.tag === 'gallery').length;
      const updated = prev.map(c =>
        c.tag === 'hero' ? { ...c, tag: galleryCount < 8 ? 'gallery' as PhotoTag : null } : c,
      );
      return [...updated, newPhoto];
    });
  }, []);

  // Replace a candidate URL (after crop/enhance)
  const replaceUrl = useCallback((photoId: string, newUrl: string) => {
    setCandidates(prev => prev.map(c =>
      c.id === photoId ? { ...c, url: newUrl } : c,
    ));
  }, []);

  // Rehost a single external photo to Supabase storage
  const rehostPhoto = async (photo: CandidatePhoto): Promise<string> => {
    // Use full-res URL for rehosting (thumbnail is only for display)
    const sourceUrl = photo.fullResUrl || photo.url;

    // Already hosted on Supabase
    if (sourceUrl.includes('supabase.co')) return sourceUrl;

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
      body.photo_url = sourceUrl;
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

      // Save immediately with full-res URLs (external or Supabase)
      // Then rehost external photos in the background after save completes
      const heroUrl = (heroPhoto?.fullResUrl || heroPhoto?.url) ?? listing.hero_image;
      const equipUrl = (equipPhoto?.fullResUrl || equipPhoto?.url) ?? null;
      const galleryUrls = galleryPhotos.map(p => p.fullResUrl || p.url);

      // Collect external photos to rehost after save (check fullResUrl too since url may be thumbnail)
      const toRehost = [heroPhoto, equipPhoto, ...galleryPhotos]
        .filter(Boolean)
        .filter(p => {
          const saveUrl = p!.fullResUrl || p!.url;
          return !saveUrl.includes('supabase.co');
        }) as CandidatePhoto[];
      const blockedUrls = [...(listing.blocked_photos ?? []), ...skippedUrls];

      console.log('[SaveAll] hero tagged:', heroPhoto?.id, 'heroUrl:', heroUrl?.slice(0, 80), 'old hero:', listing.hero_image?.slice(0, 80));
      console.log('[SaveAll] gallery:', galleryUrls.length, 'skipped:', skippedUrls.length, 'toRehost:', toRehost.length);

      // Combine hero + gallery into photos array (hero first if present)
      // Only include photos that were explicitly tagged — don't carry over untagged old photos
      const allPhotos = new Set<string>();
      if (heroUrl) allPhotos.add(heroUrl);
      for (const url of galleryUrls) allPhotos.add(url);
      // Keep existing gallery photos that are still tagged as gallery
      const taggedGalleryUrls = new Set(galleryUrls);
      const existingGallery = candidates.filter(c => c.source === 'existing' && c.tag === 'gallery');
      for (const p of existingGallery) {
        allPhotos.add(p.url);
      }

      const updateData: Record<string, unknown> = {
        hero_image: heroUrl,
        photos: Array.from(allPhotos),
        blocked_photos: blockedUrls,
      };

      if (heroPhoto) {
        // Always write 'manual' — the user explicitly chose this photo.
        // Without 'manual', chain brand images (BP, Holiday, Kwik Trip) take priority
        // over a location-specific hero on the public listing page.
        updateData.hero_image_source = 'manual';
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

      // Background rehost: download external photos and update URLs in DB
      if (toRehost.length > 0) {
        console.log(`[SaveAll] Background rehosting ${toRehost.length} external photos...`);
        const listingId = listing.id;
        Promise.allSettled(
          toRehost.map(async (p) => {
            try {
              const rehostedUrl = await rehostPhoto(p);
              const savedUrl = p.fullResUrl || p.url;
              // Update the URL in the DB (hero or photos array)
              if (p.tag === 'hero') {
                await supabase.from('listings').update({ hero_image: rehostedUrl }).eq('id', listingId);
              }
              // For gallery photos, update the photos array
              const { data: current } = await supabase.from('listings').select('photos').eq('id', listingId).single();
              if (current?.photos) {
                const updated = (current.photos as string[]).map((u: string) => u === savedUrl ? rehostedUrl : u);
                await supabase.from('listings').update({ photos: updated }).eq('id', listingId);
              }
            } catch (e) {
              console.warn(`[Rehost] Failed for ${p.url.slice(0, 60)}:`, e);
            }
          }),
        ).then(() => console.log('[SaveAll] Background rehost complete'));
      }

      return true;
    } catch (err) {
      console.error('Save failed:', err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Manually set equipment brand/model
  const setEquipment = useCallback(async (brand: string | null, model: string | null) => {
    if (!listing) return;
    await supabase.from('listings').update({
      equipment_brand: brand,
      equipment_model: model,
      classification_source: 'manual',
    }).eq('id', listing.id);
    setListing(prev => prev ? { ...prev, equipment_brand: brand, equipment_model: model } : prev);
  }, [listing]);

  // Classify equipment using AI
  const classifyEquipment = useCallback(async () => {
    if (!listing || classifying) return;
    // Use the current hero in the modal, not the saved one in DB
    const currentHero = candidates.find(c => c.tag === 'hero');
    const imageUrl = currentHero?.url ?? listing.hero_image;
    if (!imageUrl) {
      setClassifyResult('No hero image to classify');
      return;
    }
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
        body: JSON.stringify({ listing_id: listingId, image_url: imageUrl }),
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
  }, [listing, classifying, listingId, loadListing, candidates]);

  // Toggle admin touchless verification
  const toggleTouchlessVerified = useCallback(async () => {
    if (!listing) return;
    const newValue = listing.touchless_verified === 'admin' ? null : 'admin';
    await supabase.from('listings').update({ touchless_verified: newValue }).eq('id', listing.id);
    setListing(prev => prev ? { ...prev, touchless_verified: newValue } : prev);
  }, [listing]);

  // Mark as not touchless
  const markNotTouchless = useCallback(async () => {
    if (!listing) return;
    setSaving(true);
    await supabase.from('listings').update({ is_touchless: false }).eq('id', listing.id);
    await supabase.from('photo_audit_results').update({ reviewed: true, applied: true }).eq('listing_id', listing.id);
    setSaving(false);
  }, [listing]);

  // Approve listing (save + mark reviewed_at)
  const approveAndNext = async (onUpdate?: () => void, onNext?: () => void, onClose?: () => void): Promise<void> => {
    const ok = await saveAll();
    if (!ok) return;

    // Set reviewed_at timestamp on the listing
    if (listing) {
      await supabase
        .from('listings')
        .update({ reviewed_at: new Date().toISOString(), is_approved: true })
        .eq('id', listing.id);
    }

    onUpdate?.();
    if (onNext) onNext();
    else onClose?.();
  };

  // Delete listing
  const updateWebsite = useCallback(async (newUrl: string | null) => {
    if (!listing) return;
    await supabase.from('listings').update({ website: newUrl }).eq('id', listing.id);
    setListing(prev => prev ? { ...prev, website: newUrl } : prev);
  }, [listing]);

  // Set fallback hero — marks listing as "no suitable hero found, use fallback"
  // This removes it from the No Hero queue by setting a non-null hero_image
  const setFallbackHero = useCallback(async () => {
    if (!listing) return;
    const fallbackUrl = '/images/card-fallback.svg';
    await supabase.from('listings').update({
      hero_image: fallbackUrl,
      hero_image_source: 'fallback',
    }).eq('id', listing.id);
    setListing(prev => prev ? { ...prev, hero_image: fallbackUrl, hero_image_source: 'fallback' } : prev);
  }, [listing]);

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
    addHeroDirect,
    replaceUrl,
    saveAll,
    approveAndNext,
    discoverPhotos,
    classifyEquipment,
    setEquipment,
    toggleTouchlessVerified,
    markNotTouchless,
    updateWebsite,
    setFallbackHero,
    deleteListing,
    loadListing,
  };
}
