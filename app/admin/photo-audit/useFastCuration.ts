'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { canonicalizeEquipmentBrand, canonicalizeEquipmentModel } from '../hero-review/types';

export type PhotoTag = 'hero' | 'gallery' | 'equipment' | 'skip' | null;
export type PhotoSource = 'google_places' | 'google_maps' | 'google_search' | 'bing_search' | 'website' | 'street_view' | 'existing' | 'capture' | 'upload';

// Generic placeholder hero (local asset) used when no real photo exists.
// Treated specially in saveAll: never rehosted, kept out of the gallery, and
// recorded with hero_image_source='fallback' (not 'manual').
export const FALLBACK_HERO_URL = '/images/card-fallback.svg';

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
  address: string | null;
  zip: string | null;
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
  is_approved: boolean | null;
  is_touchless: boolean | null;
  crawl_notes: string | null;
  // Set by markClosed() to one of 'closed_permanently_admin' /
  // 'closed_temporarily_admin' / other classification labels. Read by
  // FastCurationModal to surface a Closed status badge.
  classification_source: string | null;
  // Count of review_snippets with is_touchless_evidence=true for this listing.
  // Loaded alongside the listing so the "User Verified" badge only shows when
  // there's actual review evidence behind touchless_verified='user_review'
  // (the flag alone can persist after snippets are deduped/relabeled, or be set
  // by importers, so it isn't proof of review evidence on its own).
  touchless_evidence_count?: number;
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
  // Tracks an explicit "delete hero" action from the user so saveAll can
  // distinguish it from "user didn't touch the hero" (which should preserve
  // the existing value). Without this, the nullish-coalescing in saveAll
  // falls back to listing.hero_image and silently reverts the deletion.
  const [heroRemoved, setHeroRemoved] = useState(false);
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
    const [{ data }, { count: evidenceCount }] = await Promise.all([
      supabase
        .from('listings')
        .select('id, name, city, state, address, zip, slug, latitude, longitude, google_place_id, website, hero_image, hero_image_source, photos, street_view_url, google_photo_url, blocked_photos, equipment_brand, equipment_model, touchless_verified, touchless_evidence, parent_chain, is_approved, is_touchless, crawl_notes, classification_source')
        .eq('id', listingId)
        .maybeSingle(),
      // Real review evidence behind a 'user_review' verification: count of
      // touchless-evidence snippets. Gates the "User Verified" badge so it never
      // shows on a listing with no touchless review snippets.
      supabase
        .from('review_snippets')
        .select('id', { count: 'exact', head: true })
        .eq('listing_id', listingId)
        .eq('is_touchless_evidence', true),
    ]);
    if (data) {
      (data as ListingData).touchless_evidence_count = evidenceCount ?? 0;
      // NOTE: We intentionally do NOT run any browser-side HEAD probes here.
      // A previous version of this code nulled hero_image and filtered photos[]
      // whenever a HEAD fetch failed (CORS, timeout, network blip, extension
      // blocking, etc.) — which wiped hundreds of perfectly-valid images from
      // the DB every time a user opened a listing. If a photo URL is actually
      // broken, the <img> onError handler in PhotoGrid catches it visually;
      // we never silently mutate the DB based on a transient fetch failure.
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
      setHeroRemoved(false);
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
      } else if (listing.hero_image_source === 'fallback') {
        // Admin previously accepted the generic placeholder (hero_image stays NULL
        // by DB-trigger design). Show it so the curator sees the listing is handled.
        existing.push({
          id: 'fallback-hero',
          url: FALLBACK_HERO_URL,
          source: 'existing',
          label: 'Hero (fallback)',
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
    setHeroRemoved(true);
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
      // Background rehost: do NOT let the edge function mutate listings.photos.
      // saveAll() already wrote the final photos[] and this call is only to
      // convert an external URL into a supabase-hosted one; the caller
      // (inside saveAll's Promise.allSettled loop) swaps the old URL for the
      // rehosted one itself. Without this flag the edge function appends the
      // rehosted URL, producing duplicates after every save.
      update_listing: false,
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
      // Then rehost external photos in the background after save completes.
      // When heroRemoved is true, the user explicitly deleted the hero — write
      // null instead of falling back to the existing DB value.
      const heroUrl = heroPhoto
        ? (heroPhoto.fullResUrl || heroPhoto.url)
        : heroRemoved ? null : listing.hero_image;
      const equipUrl = (equipPhoto?.fullResUrl || equipPhoto?.url) ?? null;
      const galleryUrls = galleryPhotos.map(p => p.fullResUrl || p.url);

      // Collect external photos to rehost after save (check fullResUrl too since url may be thumbnail)
      const toRehost = [heroPhoto, equipPhoto, ...galleryPhotos]
        .filter(Boolean)
        .filter(p => {
          const saveUrl = p!.fullResUrl || p!.url;
          // Local fallback placeholder is not an external image — never rehost it.
          return !saveUrl.includes('supabase.co') && saveUrl !== FALLBACK_HERO_URL;
        }) as CandidatePhoto[];
      const blockedUrls = [...(listing.blocked_photos ?? []), ...skippedUrls];

      console.log('[SaveAll] hero tagged:', heroPhoto?.id, 'heroUrl:', heroUrl?.slice(0, 80), 'old hero:', listing.hero_image?.slice(0, 80));
      console.log('[SaveAll] gallery:', galleryUrls.length, 'skipped:', skippedUrls.length, 'toRehost:', toRehost.length);

      // Combine hero + gallery into photos array (hero first if present)
      // Only include photos that were explicitly tagged — don't carry over untagged old photos
      const allPhotos = new Set<string>();
      // Keep the generic fallback out of the gallery — it's a hero placeholder only.
      if (heroUrl && heroUrl !== FALLBACK_HERO_URL) allPhotos.add(heroUrl);
      for (const url of galleryUrls) allPhotos.add(url);
      // Keep existing gallery photos that are still tagged as gallery
      const taggedGalleryUrls = new Set(galleryUrls);
      const existingGallery = candidates.filter(c => c.source === 'existing' && c.tag === 'gallery');
      for (const p of existingGallery) {
        allPhotos.add(p.url);
      }

      const updateData: Record<string, unknown> = {
        photos: Array.from(allPhotos),
        blocked_photos: blockedUrls,
      };

      // Only touch hero_image when there's an explicit hero action. Writing it
      // unconditionally is unsafe: if a render-timing race leaves listing.hero_image
      // momentarily null in this closure, we'd clobber a hero that was already
      // persisted (e.g. the "Use Fallback" placeholder) back to null. Leaving the
      // column out preserves whatever is in the DB.
      if (heroPhoto && heroUrl === FALLBACK_HERO_URL) {
        // Generic placeholder. Do NOT write hero_image — the reject_broken_hero_url
        // DB trigger NULLs the placeholder path (and would null this source with it).
        // Mark the decision with source='fallback' and leave hero_image NULL.
        updateData.hero_image_source = 'fallback';
      } else if (heroPhoto) {
        updateData.hero_image = heroUrl;
        // Always write 'manual' — the user explicitly chose this photo. Without
        // 'manual', chain brand images can override a location-specific hero on
        // the public listing page.
        updateData.hero_image_source = 'manual';
      } else if (heroRemoved) {
        // Explicit deletion: null both so chain-brand fallback (and downstream
        // enrichment) can take over cleanly.
        updateData.hero_image = null;
        updateData.hero_image_source = null;
      }
      // else: no explicit hero change — leave hero_image/source untouched.

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

      // Reset the explicit-deletion flag now that the null has been persisted.
      if (heroRemoved) setHeroRemoved(false);

      // Background rehost: download external photos and swap their URLs in DB.
      // IMPORTANT: Serialize this loop. Parallel rehosts race on the read-
      // modify-write of listings.photos — each call reads, maps one URL, and
      // writes back, so two overlapping operations make the later write
      // overwrite the earlier one's URL replacement. Sequential is slower
      // but correct, and it runs in the background post-save so the user
      // doesn't wait on it.
      if (toRehost.length > 0) {
        console.log(`[SaveAll] Background rehosting ${toRehost.length} external photos...`);
        const listingId = listing.id;
        (async () => {
          for (const p of toRehost) {
            try {
              const rehostedUrl = await rehostPhoto(p);
              const savedUrl = p.fullResUrl || p.url;
              if (p.tag === 'hero') {
                await supabase.from('listings').update({ hero_image: rehostedUrl }).eq('id', listingId);
              }
              const { data: current } = await supabase.from('listings').select('photos').eq('id', listingId).single();
              if (current?.photos) {
                const mapped = (current.photos as string[]).map((u: string) => u === savedUrl ? rehostedUrl : u);
                // Dedupe — defensive, in case another code path already
                // added the rehosted URL while this rehost was in flight.
                const updated = Array.from(new Set(mapped));
                await supabase.from('listings').update({ photos: updated }).eq('id', listingId);
              }
            } catch (e) {
              console.warn(`[Rehost] Failed for ${p.url.slice(0, 60)}:`, e);
            }
          }
          console.log('[SaveAll] Background rehost complete');
        })();
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
    // Canonicalize before writing so custom-entry prompts and dropdown selections
    // converge on a single value per real brand/model instead of creating case-
    // variant duplicates (e.g. "Double Barrel" typed in the prompt collapses onto
    // the "Razor Double Barrel" dropdown option for WashWorld).
    const canonBrand = canonicalizeEquipmentBrand(brand);
    const canonModel = canonicalizeEquipmentModel(canonBrand, model);
    await supabase.from('listings').update({
      equipment_brand: canonBrand,
      equipment_model: canonModel,
      classification_source: 'manual',
    }).eq('id', listing.id);
    setListing(prev => prev ? { ...prev, equipment_brand: canonBrand, equipment_model: canonModel } : prev);
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

  // Mark as NOT touchless. Also unapprove and clear touchless_verified —
  // this is a touchless-only directory, so a non-touchless listing
  // shouldn't carry "Admin Verified" / "User Verified" status.
  // Appends an audit-confirmation marker to crawl_notes so the listing
  // falls out of any re-review queue (e.g. Second Look) — without this
  // a listing that's already is_touchless=false stays in the queue
  // forever because the click was a no-op on the actual flags.
  const markNotTouchless = useCallback(async () => {
    if (!listing) return;
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const auditMarker = `[${today}] Manual photo-audit re-audit confirmed correctly demoted: admin reviewed the listing and confirmed it is not touchless.`;
    const existing = listing.crawl_notes || '';
    // Only append if a confirmed-demoted marker isn't already there —
    // avoids stacking duplicate notes if the button is clicked twice.
    const newNotes = /re-audit confirmed correctly demoted/i.test(existing)
      ? existing
      : (existing.slice(0, 4500) + (existing ? '\n\n' : '') + auditMarker);
    await supabase.from('listings').update({
      is_touchless: false,
      is_approved: false,
      touchless_verified: null,
      crawl_notes: newNotes,
    }).eq('id', listing.id);
    await supabase.from('photo_audit_results').update({ reviewed: true, applied: true }).eq('listing_id', listing.id);
    setListing(prev => prev ? { ...prev, is_touchless: false, is_approved: false, touchless_verified: null, crawl_notes: newNotes } : prev);
    setSaving(false);
  }, [listing]);

  // Mark as touchless — used to flip a previously-demoted listing back
  // when an admin finds clear touchless evidence (e.g. a "Touch Free" sign
  // visible in a photo). Doesn't auto-approve — the admin still has to
  // hit Approve & Next once they're satisfied with the photo set.
  const markTouchless = useCallback(async () => {
    if (!listing) return;
    setSaving(true);
    await supabase.from('listings').update({ is_touchless: true }).eq('id', listing.id);
    setListing(prev => prev ? { ...prev, is_touchless: true } : prev);
    setSaving(false);
  }, [listing]);

  // Mark as "can't verify" — used when the admin can't locate the
  // business on Google Maps / Street View and can't make a confident
  // call either way. Adds an audit marker so the listing falls out of
  // the Second Look queue (the bucket excludes "re-audit confirmed
  // correctly demoted" markers; we use a similar marker here so this
  // listing is treated as "set aside" rather than re-presented every
  // time the queue reloads). Doesn't change is_touchless or is_approved.
  const markCantVerify = useCallback(async () => {
    if (!listing) return;
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const auditMarker = `[${today}] Manual photo-audit re-audit confirmed correctly demoted: admin could not locate the business on Google Maps / Street View — needs further investigation before it can be re-classified.`;
    const existing = listing.crawl_notes || '';
    const newNotes = /re-audit confirmed correctly demoted/i.test(existing)
      ? existing
      : (existing.slice(0, 4500) + (existing ? '\n\n' : '') + auditMarker);
    await supabase.from('listings').update({ crawl_notes: newNotes }).eq('id', listing.id);
    await supabase.from('photo_audit_results').update({ reviewed: true, applied: true }).eq('listing_id', listing.id);
    setListing(prev => prev ? { ...prev, crawl_notes: newNotes } : prev);
    setSaving(false);
  }, [listing]);

  // Mark listing as closed (permanently or temporarily). Matches the schema
  // the detect-closed-via-places script uses, so the public listing page
  // redirects to the nearest city with a closed-specific banner. Keeps the
  // row (don't delete) so inbound URLs continue to resolve via 301.
  const markClosed = useCallback(async (status: 'permanent' | 'temporary') => {
    if (!listing) return;
    setSaving(true);
    const src = status === 'permanent'
      ? 'closed_permanently_admin'
      : 'closed_temporarily_admin';
    const note = `[${new Date().toISOString().slice(0,10)}] Marked as closed ${status} via photo-audit admin.`;
    await supabase.from('listings').update({
      is_approved: false,
      classification_source: src,
      crawl_notes: note,
    }).eq('id', listing.id);
    await supabase.from('photo_audit_results').update({ reviewed: true, applied: true }).eq('listing_id', listing.id);
    setSaving(false);
  }, [listing]);

  // Approve listing (save + mark reviewed_at)
  const approveAndNext = async (onUpdate?: () => void, onNext?: () => void, onClose?: () => void): Promise<void> => {
    // Guard: a blank city produces an invalid public URL (/state/<code>//<slug>)
    // that 404s, and a blank street address ships a partial listing that renders
    // with no location (the Bellis Fair case). Block approval on either so we
    // never ship another partial listing like the OSM-name-imported batch.
    if (listing) {
      const missingCity = !listing.city || !listing.city.trim();
      const missingStreet = !listing.address || !listing.address.trim();
      if (missingCity || missingStreet) {
        const what = [missingStreet && 'street address', missingCity && 'city']
          .filter(Boolean).join(' and ');
        alert(`"${listing.name}" has no ${what} — fill it in before approving (a partial listing breaks the public URL and renders with no location).`);
        return;
      }
    }

    const ok = await saveAll();
    if (!ok) return;

    // Set reviewed_at + photo_audited_at timestamps and is_approved=true.
    // photo_audited_at is what filters listings out of the "Unscanned" tab, so
    // approving without setting it would leave them in the queue forever.
    // If the listing is currently flagged Not Touchless, also flip
    // is_touchless=true — clicking Approve on a touchless-only directory
    // is an implicit assertion that the listing IS a touchless car wash.
    // (Without this, the previous "Not Touchless" state would persist
    // even after Approve & Next, which surprised the admin.)
    if (listing) {
      const now = new Date().toISOString();
      const update: Record<string, unknown> = { reviewed_at: now, photo_audited_at: now, is_approved: true };
      if (listing.is_touchless === false) update.is_touchless = true;
      await supabase
        .from('listings')
        .update(update)
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

  // Set fallback hero — marks listing as "no suitable hero found, use the generic
  // placeholder". NOTE: we do NOT write hero_image here. A DB trigger
  // (reject_broken_hero_url) silently NULLs hero_image whenever it equals the
  // placeholder path, so writing it is futile. Instead we mark the decision with
  // hero_image_source='fallback' (hero_image stays NULL) — a marker the trigger
  // leaves untouched. The No Hero queue excludes source='fallback', and the public
  // site already renders the placeholder when hero_image is null.
  const setFallbackHero = useCallback(async () => {
    if (!listing) return;
    await supabase.from('listings').update({
      hero_image_source: 'fallback',
    }).eq('id', listing.id);
    setListing(prev => prev ? { ...prev, hero_image_source: 'fallback' } : prev);
    // Reflect the fallback in the hero box immediately — demote any existing hero
    // to gallery and add the placeholder as the tagged hero candidate (display only).
    setCandidates(prev => {
      const galleryCount = prev.filter(c => c.tag === 'gallery').length;
      const updated = prev.map(c =>
        c.tag === 'hero' ? { ...c, tag: galleryCount < 8 ? 'gallery' as PhotoTag : null } : c,
      );
      return [...updated, {
        id: 'fallback-hero',
        url: FALLBACK_HERO_URL,
        source: 'existing',
        label: 'Hero (fallback)',
        tag: 'hero' as PhotoTag,
      }];
    });
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
    markTouchless,
    markCantVerify,
    markNotTouchless,
    markClosed,
    updateWebsite,
    setFallbackHero,
    deleteListing,
    loadListing,
    heroRemoved,
  };
}
