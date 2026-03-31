'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Star, Trash2, Crop, Wand2, ZoomIn, ChevronLeft, ChevronRight, ImageOff, ExternalLink, Check, Upload, Sparkles, Loader2, ImagePlus, Plus, ChevronDown, ChevronUp, Ban, MapPin, Globe, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { CropModal } from '../hero-review/CropModal';
import { autoEnhanceImage } from '../hero-review/autoEnhance';
import { getStateSlug, slugify } from '@/lib/constants';
import { EQUIPMENT_BRANDS, EQUIPMENT_MODELS } from '../hero-review/types';

interface ListingData {
  id: string;
  name: string;
  hero_image: string | null;
  hero_image_source: string | null;
  photos: string[] | null;
  city: string;
  state: string;
  slug: string;
  google_photo_url: string | null;
  street_view_url: string | null;
  blocked_photos: string[] | null;
  equipment_brand: string | null;
  equipment_model: string | null;
  google_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
}

interface Props {
  listingId: string;
  onClose: () => void;
  onUpdate?: () => void; // callback to refresh parent data
  onNext?: () => void; // advance to next listing in queue
}

export function ListingEditorModal({ listingId, onClose, onUpdate, onNext }: Props) {
  const [listing, setListing] = useState<ListingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [enhancedPreview, setEnhancedPreview] = useState<string | null>(null); // data URL for preview
  const [preEnhance, setPreEnhance] = useState<{ url: string; source: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classifyResult, setClassifyResult] = useState<string | null>(null);
  const [googlePhotos, setGooglePhotos] = useState<Array<{ name: string; url: string }> | null>(null);
  const [googlePhotosTotal, setGooglePhotosTotal] = useState(0);
  const [googlePhotosHasMore, setGooglePhotosHasMore] = useState(false);
  const [googlePhotosOpen, setGooglePhotosOpen] = useState(false);
  const [googlePhotosLoading, setGooglePhotosLoading] = useState(false);
  const [savingGooglePhoto, setSavingGooglePhoto] = useState<string | null>(null);
  const [googleLightboxIndex, setGoogleLightboxIndex] = useState<number | null>(null);
  const [classifyEvidence, setClassifyEvidence] = useState<string | null>(null);
  const [pasteUrlOpen, setPasteUrlOpen] = useState(false);
  const [pasteUrlValue, setPasteUrlValue] = useState('');
  const [pasteUrlLoading, setPasteUrlLoading] = useState(false);
  const [galleryPasteOpen, setGalleryPasteOpen] = useState(false);
  const [galleryPasteValue, setGalleryPasteValue] = useState('');
  const [galleryPasteLoading, setGalleryPasteLoading] = useState(false);
  const [cropGalleryUrl, setCropGalleryUrl] = useState<string | null>(null);
  const [enhancingGalleryUrl, setEnhancingGalleryUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteInputRef = useRef<HTMLInputElement>(null);
  const galleryPasteInputRef = useRef<HTMLInputElement>(null);

  const loadListing = useCallback(async () => {
    const { data } = await supabase
      .from('listings')
      .select('id, name, hero_image, hero_image_source, photos, city, state, slug, google_photo_url, street_view_url, blocked_photos, equipment_brand, equipment_model, google_place_id, latitude, longitude, website')
      .eq('id', listingId)
      .maybeSingle();
    if (data) setListing(data as ListingData);
    setLoading(false);
  }, [listingId]);

  useEffect(() => { loadListing(); }, [loadListing]);

  // Reset all state when advancing to a new listing
  useEffect(() => {
    setListing(null);
    setLoading(true);
    setLightboxIndex(null);
    setCropOpen(false);
    setEnhancing(false);
    setEnhancedPreview(null);
    setPreEnhance(null);
    setSaving(false);
    setUploading(false);
    setClassifying(false);
    setClassifyResult(null);
    setGooglePhotos(null);
    setGooglePhotosTotal(0);
    setGooglePhotosHasMore(false);
    setGooglePhotosOpen(false);
    setGooglePhotosLoading(false);
    setSavingGooglePhoto(null);
    setGoogleLightboxIndex(null);
    setClassifyEvidence(null);
    setGalleryPasteOpen(false);
    setGalleryPasteValue('');
    setGalleryPasteLoading(false);
    setCropGalleryUrl(null);
    setEnhancingGalleryUrl(null);
    setPasteUrlOpen(false);
    setPasteUrlValue('');
    setPasteUrlLoading(false);
  }, [listingId]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (googleLightboxIndex !== null) { setGoogleLightboxIndex(null); return; }
        if (lightboxIndex !== null) { setLightboxIndex(null); return; }
        if (cropOpen) return;
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, lightboxIndex, cropOpen, googleLightboxIndex]);

  const revalidate = useCallback(async () => {
    if (!listing) return;
    const stateSlug = getStateSlug(listing.state);
    const citySlug = slugify(listing.city);
    try {
      await fetch('/api/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `/state/${stateSlug}/${citySlug}/${listing.slug}` }),
      });
    } catch {}
  }, [listing]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <p className="text-white">Listing not found</p>
        <button onClick={onClose} className="ml-4 text-white underline">Close</button>
      </div>
    );
  }

  const allPhotos = listing.photos ?? [];
  const heroBase = listing.hero_image;
  // Include google_photo_url and street_view_url in the gallery display — these appear
  // on the public listing page even when not in the photos array, so show them here too.
  const autoPhotos = [listing.google_photo_url, listing.street_view_url]
    .filter((u): u is string => !!u && u !== heroBase && !allPhotos.includes(u));
  const galleryPhotos = [...allPhotos.filter(p => p !== heroBase), ...autoPhotos];

  // ─── Actions ────────────────────────────────────────────────────

  const setAsHero = async (url: string, _source: string = 'gallery') => {
    setSaving(true);
    const oldHero = listing.hero_image;
    const currentPhotos = listing.photos ?? [];

    // Preserve old hero in gallery
    let updatedPhotos = oldHero && !currentPhotos.includes(oldHero)
      ? [oldHero, ...currentPhotos]
      : [...currentPhotos];
    if (!updatedPhotos.includes(url)) {
      updatedPhotos = [url, ...updatedPhotos];
    }

    // Always mark as 'manual' — a human explicitly chose this photo.
    // Without 'manual', chain brand images (BP, Holiday, Kwik Trip) override this
    // location-specific hero on the public listing page.
    await supabase.from('listings').update({
      hero_image: url,
      hero_image_source: 'manual',
      photos: updatedPhotos,
    }).eq('id', listing.id);

    await supabase.from('hero_reviews').insert({
      listing_id: listing.id,
      action: 'replaced',
      old_hero_url: oldHero,
      new_hero_url: url,
      new_source: source,
    });

    setListing(prev => prev ? { ...prev, hero_image: url, hero_image_source: source, photos: updatedPhotos } : prev);
    setPreEnhance(null);
    setEnhancedPreview(null);
    revalidate();
    onUpdate?.();
    setSaving(false);
  };

  const deleteHero = async () => {
    if (!listing.hero_image) return;
    setSaving(true);
    const heroUrl = listing.hero_image;
    const blocked = listing.blocked_photos ?? [];
    const newBlocked = blocked.includes(heroUrl) ? blocked : [heroUrl, ...blocked];
    // Also remove from photos array so it doesn't reappear in gallery
    const updatedPhotos = (listing.photos ?? []).filter(p => p !== heroUrl);

    await supabase.from('listings').update({
      hero_image: null,
      hero_image_source: null,
      blocked_photos: newBlocked,
      photos: updatedPhotos,
    }).eq('id', listing.id);

    setListing(prev => prev ? { ...prev, hero_image: null, hero_image_source: null, blocked_photos: newBlocked, photos: updatedPhotos } : prev);
    setPreEnhance(null);
    setEnhancedPreview(null);
    revalidate();
    onUpdate?.();
    setSaving(false);
  };

  const removeGalleryPhoto = async (photoUrl: string) => {
    setSaving(true);
    const currentPhotos = listing.photos ?? [];
    const newPhotos = currentPhotos.filter(p => p !== photoUrl);
    const blocked = listing.blocked_photos ?? [];
    const newBlocked = blocked.includes(photoUrl) ? blocked : [...blocked, photoUrl];

    await supabase.from('listings').update({
      photos: newPhotos.length > 0 ? newPhotos : null,
      blocked_photos: newBlocked,
    }).eq('id', listing.id);

    setListing(prev => prev ? { ...prev, photos: newPhotos.length > 0 ? newPhotos : null, blocked_photos: newBlocked } : prev);
    revalidate();
    onUpdate?.();
    setSaving(false);
  };

  const handleCropSave = async (croppedUrl: string) => {
    setSaving(true);
    await supabase.from('listings').update({
      hero_image: croppedUrl,
      hero_image_source: 'gallery',
    }).eq('id', listing.id);

    setListing(prev => prev ? { ...prev, hero_image: croppedUrl, hero_image_source: 'gallery' } : prev);
    setPreEnhance(null);
    setEnhancedPreview(null);
    setCropOpen(false);
    revalidate();
    onUpdate?.();
    setSaving(false);
  };

  const handleEnhance = async () => {
    if (!listing?.hero_image || enhancing) return;

    // Toggle OFF — just clear the preview
    if (enhancedPreview) {
      setEnhancedPreview(null);
      return;
    }

    // Toggle ON — generate enhanced preview (client-side only, no upload)
    setEnhancing(true);
    try {
      const blob = await autoEnhanceImage(listing.hero_image);
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      setEnhancedPreview(dataUrl);
    } catch (err) {
      console.error('Enhance preview failed:', err);
    } finally {
      setEnhancing(false);
    }
  };

  const saveEnhancedHero = async () => {
    if (!listing?.hero_image || !enhancedPreview) return;
    setEnhancing(true);
    try {
      // Convert data URL back to blob
      const res = await fetch(enhancedPreview);
      const blob = await res.blob();

      const formData = new FormData();
      formData.append('file', blob, 'enhanced-hero.jpg');
      formData.append('listingId', listing.id);
      formData.append('type', 'hero');

      const uploadRes = await fetch('/api/upload-image', { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error(await uploadRes.text());
      const { url } = await uploadRes.json() as { url: string };

      const originalUrl = listing.hero_image;
      const currentPhotos = listing.photos ?? [];
      const updatedPhotos = currentPhotos.map(p => p === originalUrl ? url : p);

      await supabase.from('listings').update({
        hero_image: url,
        hero_image_source: 'gallery',
        photos: updatedPhotos,
      }).eq('id', listing.id);

      setListing(prev => prev ? { ...prev, hero_image: url, hero_image_source: 'gallery', photos: updatedPhotos } : prev);
      setEnhancedPreview(null);
      revalidate();
      onUpdate?.();
    } catch (err) {
      console.error('Save enhanced hero failed:', err);
    } finally {
      setEnhancing(false);
    }
  };

  const handleUploadHero = async (file: File) => {
    if (!listing) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('listingId', listing.id);
      formData.append('type', 'hero');

      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json() as { url: string };

      // Move old hero into gallery, set new uploaded image as hero
      const oldHero = listing.hero_image;
      const currentPhotos = listing.photos ?? [];
      let updatedPhotos = [...currentPhotos];
      if (oldHero && !updatedPhotos.includes(oldHero)) {
        updatedPhotos.unshift(oldHero);
      }
      if (!updatedPhotos.includes(url)) {
        updatedPhotos = [url, ...updatedPhotos];
      }

      await supabase.from('listings').update({
        hero_image: url,
        hero_image_source: 'gallery',
        photos: updatedPhotos,
      }).eq('id', listing.id);

      await supabase.from('hero_reviews').insert({
        listing_id: listing.id,
        action: 'replaced',
        old_hero_url: oldHero,
        new_hero_url: url,
        new_source: 'upload',
      });

      setListing(prev => prev ? { ...prev, hero_image: url, hero_image_source: 'gallery', photos: updatedPhotos } : prev);
      setPreEnhance(null);
    setEnhancedPreview(null);
      revalidate();
      onUpdate?.();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const parseGoogleUrl = (rawUrl: string): string => {
    let url = rawUrl;
    if (url.includes('google.com/maps')) {
      const panoidMatch = url.match(/!1s([a-zA-Z0-9_-]+)!2e/);
      if (panoidMatch && url.includes('streetviewpixels')) {
        const yawMatch = url.match(/yaw%3D([\d.]+)/i) || url.match(/,(\d+\.?\d*)h,/);
        const heading = yawMatch ? yawMatch[1] : '0';
        return `streetview:${panoidMatch[1]}:${heading}`;
      } else {
        const match = url.match(/6shttps?:%2F%2F([^!]+)/);
        if (match) {
          url = decodeURIComponent('https://' + match[1]);
          url = url.replace(/=w\d+-h\d+-k-no/, '=w1600-h1200-k-no');
          url = url.replace(/=s\d+/, '=s1600');
          return url;
        }
        throw new Error('Could not extract image URL from Google Maps link. Try right-clicking the photo and selecting "Copy image address" instead.');
      }
    }
    return url;
  };

  const importPhotoFromUrl = async (rawUrl: string, asHero: boolean) => {
    if (!listing) return;
    const url = parseGoogleUrl(rawUrl);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(`${supabaseUrl}/functions/v1/google-place-photos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        listing_id: listing.id,
        photo_url: url,
        set_as_hero: asHero,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `HTTP ${res.status}`);
    }
    await loadListing();
    revalidate();
    onUpdate?.();
  };

  const handlePasteUrl = async () => {
    const url = pasteUrlValue.trim();
    if (!url || !listing) return;
    setPasteUrlLoading(true);
    try {
      await importPhotoFromUrl(url, true);
      setPasteUrlValue('');
      setPasteUrlOpen(false);
      setPreEnhance(null);
      setEnhancedPreview(null);
    } catch (err) {
      console.error('Paste URL failed:', err);
      alert(`Failed to save image: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setPasteUrlLoading(false);
    }
  };

  const handleGalleryPasteUrl = async () => {
    const url = galleryPasteValue.trim();
    if (!url || !listing) return;
    setGalleryPasteLoading(true);
    try {
      await importPhotoFromUrl(url, false);
      setGalleryPasteValue('');
      setGalleryPasteOpen(false);
    } catch (err) {
      console.error('Gallery paste URL failed:', err);
      alert(`Failed to save image: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGalleryPasteLoading(false);
    }
  };

  const handleGalleryCropSave = async (croppedUrl: string) => {
    if (!listing || !cropGalleryUrl) return;
    setSaving(true);
    const currentPhotos = listing.photos ?? [];
    const updatedPhotos = currentPhotos.map(p => p === cropGalleryUrl ? croppedUrl : p);
    await supabase.from('listings').update({ photos: updatedPhotos }).eq('id', listing.id);
    setListing(prev => prev ? { ...prev, photos: updatedPhotos } : prev);
    setCropGalleryUrl(null);
    revalidate();
    onUpdate?.();
    setSaving(false);
  };

  const enhanceGalleryPhoto = async (url: string) => {
    if (!listing || enhancingGalleryUrl) return;
    setEnhancingGalleryUrl(url);
    try {
      const blob = await autoEnhanceImage(url);
      const formData = new FormData();
      formData.append('file', blob, 'enhanced-gallery.jpg');
      formData.append('listingId', listing.id);
      formData.append('type', 'gallery');
      const uploadRes = await fetch('/api/upload-image', { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error(await uploadRes.text());
      const { url: newUrl } = await uploadRes.json() as { url: string };
      const currentPhotos = listing.photos ?? [];
      const updatedPhotos = currentPhotos.map(p => p === url ? newUrl : p);
      await supabase.from('listings').update({ photos: updatedPhotos }).eq('id', listing.id);
      setListing(prev => prev ? { ...prev, photos: updatedPhotos } : prev);
      revalidate();
      onUpdate?.();
    } catch (err) {
      console.error('Gallery enhance failed:', err);
    } finally {
      setEnhancingGalleryUrl(null);
    }
  };

  const setEquipment = async (brand: string | null, model: string | null) => {
    await supabase.from('listings').update({
      equipment_brand: brand,
      equipment_model: model,
    }).eq('id', listingId);
    setListing(prev => prev ? { ...prev, equipment_brand: brand, equipment_model: model } : prev);
    onUpdate?.();
  };

  const classifyWithAI = async () => {
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
        const brandLabel = EQUIPMENT_BRANDS.find(b => b.value === data.detection.brand)?.label ?? data.detection.brand;
        const modelText = data.detection.model ? ` — ${data.detection.model}` : '';
        setClassifyResult(`${brandLabel}${modelText} (${data.detection.confidence} confidence)`);
        // Show the AI's reasoning
        if (data.detection.raw_text) {
          setClassifyEvidence(data.detection.raw_text);
        } else if (data.diagnostics?.[0]?.raw_ai_response) {
          setClassifyEvidence(data.diagnostics[0].raw_ai_response);
        }
        // Reload listing to pick up saved brand/model
        if (data.saved) {
          await loadListing();
          onUpdate?.();
        } else {
          // Low confidence — show result but let user decide
          setClassifyResult(`${brandLabel}${modelText} (${data.detection.confidence} — not auto-saved)`);
        }
      } else {
        setClassifyResult('No equipment detected');
        // Show raw AI response for debugging
        if (data.diagnostics?.[0]?.raw_ai_response) {
          setClassifyEvidence(data.diagnostics[0].raw_ai_response);
        }
      }
    } catch (err) {
      console.error('AI classification failed:', err);
      const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
      setClassifyResult(isTimeout ? 'Classification timed out — try again' : 'Classification failed — try again');
    } finally {
      setClassifying(false);
    }
  };

  const markNotTouchless = async () => {
    if (!listing) return;
    setSaving(true);
    await supabase.from('listings').update({ is_touchless: false }).eq('id', listing.id);
    // Also dismiss all audit results so it leaves the Need Review queue
    await supabase
      .from('photo_audit_results')
      .update({ reviewed: true, applied: true })
      .eq('listing_id', listing.id);
    onUpdate?.();
    setSaving(false);
    if (onNext) { onNext(); } else { onClose(); }
  };

  const deleteListing = async () => {
    if (!listing) return;
    setSaving(true);
    // Dismiss audit results first (FK constraint)
    await supabase
      .from('photo_audit_results')
      .update({ reviewed: true, applied: true })
      .eq('listing_id', listing.id);
    await supabase.from('listings').delete().eq('id', listing.id);
    onUpdate?.();
    setSaving(false);
    if (onNext) { onNext(); } else { onClose(); }
  };

  const openStreetView = () => {
    if (!listing) return;
    // Only use stored URL if it's actually a Street View / Google Maps URL (not a photo)
    const isRealStreetView = listing.street_view_url &&
      listing.street_view_url.includes('google.com/maps') &&
      !listing.street_view_url.includes('googleusercontent.com');
    if (isRealStreetView && listing.street_view_url) {
      window.open(listing.street_view_url, '_blank');
    } else if (listing.latitude && listing.longitude) {
      const url = `https://www.google.com/maps/@${listing.latitude},${listing.longitude},3a,75y,0h,90t/data=!3m6!1e1!3m4!1s!2e0!7i16384!8i8192`;
      window.open(url, '_blank');
    } else {
      // Fallback: search by name + city
      const query = encodeURIComponent(`${listing.name}, ${listing.city}, ${listing.state}`);
      window.open(`https://www.google.com/maps/search/${query}`, '_blank');
    }
  };

  const dismissAudit = async () => {
    setSaving(true);
    // Mark the latest audit result for this listing as reviewed + applied
    // so it no longer appears in Need Review
    const { data: auditRows } = await supabase
      .from('photo_audit_results')
      .select('id')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (auditRows && auditRows.length > 0) {
      await supabase
        .from('photo_audit_results')
        .update({ reviewed: true, applied: true })
        .eq('id', auditRows[0].id);
    }

    onUpdate?.();
    setSaving(false);
    if (onNext) {
      onNext();
    } else {
      onClose();
    }
  };

  // ─── Google Place Photos (paginated) ────────────────────────
  const fetchGooglePhotos = async (loadMore = false) => {
    if (!listing?.google_place_id || googlePhotosLoading) return;
    setGooglePhotosLoading(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const offset = loadMore ? (googlePhotos?.length ?? 0) : 0;
      const res = await fetch(
        `${supabaseUrl}/functions/v1/google-place-photos?place_id=${encodeURIComponent(listing.google_place_id)}&offset=${offset}&limit=5`,
        { headers: { 'Authorization': `Bearer ${supabaseKey}` } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const newPhotos = data.photos ?? [];
      if (loadMore && googlePhotos) {
        setGooglePhotos([...googlePhotos, ...newPhotos]);
      } else {
        setGooglePhotos(newPhotos);
      }
      setGooglePhotosTotal(data.total ?? 0);
      setGooglePhotosHasMore(data.hasMore ?? false);
    } catch (err) {
      console.error('Failed to fetch Google photos:', err);
      if (!loadMore) setGooglePhotos([]);
    } finally {
      setGooglePhotosLoading(false);
    }
  };

  const saveGooglePhoto = async (photoName: string, photoUrl: string, asHero: boolean) => {
    if (!listing || savingGooglePhoto) return;
    setSavingGooglePhoto(photoUrl);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(`${supabaseUrl}/functions/v1/google-place-photos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          photo_name: photoName,
          listing_id: listing.id,
          set_as_hero: asHero,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      await loadListing();
      revalidate(); // fire-and-forget
      onUpdate?.();
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'Timed out (30s)' : (err?.message ?? 'Unknown error');
      alert(`Failed to save photo: ${msg}`);
      console.error('Failed to save Google photo:', err);
    } finally {
      setSavingGooglePhoto(null);
    }
  };

  const toggleGooglePhotos = () => {
    if (!googlePhotosOpen) {
      setGooglePhotosOpen(true);
      if (!googlePhotos) fetchGooglePhotos();
    } else {
      setGooglePhotosOpen(false);
    }
  };

  const stateSlug = getStateSlug(listing.state);
  const citySlug = slugify(listing.city);
  const listingUrl = `/state/${stateSlug}/${citySlug}/${listing.slug}`;

  return (
    <>
      {/* Hidden file input for hero upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUploadHero(file);
        }}
      />

      {/* Gallery lightbox */}
      {lightboxIndex !== null && galleryPhotos[lightboxIndex] && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm" onClick={() => setLightboxIndex(null)}>
          {lightboxIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {lightboxIndex < galleryPhotos.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={galleryPhotos[lightboxIndex]}
              alt=""
              className="max-w-[88vw] max-h-[75vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="flex items-center gap-2">
              <span className="text-white/40 text-xs">{lightboxIndex + 1} / {galleryPhotos.length}</span>
              <div className="w-px h-4 bg-white/20" />
              <button
                onClick={() => { setAsHero(galleryPhotos[lightboxIndex]); setLightboxIndex(null); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold shadow-lg"
              >
                <Star className="w-3.5 h-3.5" /> Use as hero
              </button>
              <button
                onClick={() => { setCropGalleryUrl(galleryPhotos[lightboxIndex]); setLightboxIndex(null); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold shadow-lg"
              >
                <Crop className="w-3.5 h-3.5" /> Crop
              </button>
              <button
                onClick={() => { enhanceGalleryPhoto(galleryPhotos[lightboxIndex]); setLightboxIndex(null); }}
                disabled={!!enhancingGalleryUrl}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold shadow-lg disabled:opacity-50"
              >
                <Wand2 className="w-3.5 h-3.5" /> Enhance
              </button>
              <button
                onClick={() => {
                  const url = galleryPhotos[lightboxIndex];
                  const remaining = galleryPhotos.length - 1;
                  removeGalleryPhoto(url);
                  if (remaining <= 0) setLightboxIndex(null);
                  else if (lightboxIndex >= remaining) setLightboxIndex(remaining - 1);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold shadow-lg"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
              <button
                onClick={() => setLightboxIndex(null)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
              >
                <X className="w-3.5 h-3.5" /> Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Photos lightbox */}
      {googleLightboxIndex !== null && googlePhotos && googlePhotos[googleLightboxIndex] && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm" onClick={() => setGoogleLightboxIndex(null)}>
          {googleLightboxIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setGoogleLightboxIndex(googleLightboxIndex - 1); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {googleLightboxIndex < googlePhotos.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setGoogleLightboxIndex(googleLightboxIndex + 1); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={googlePhotos[googleLightboxIndex].url}
              alt=""
              className="max-w-[88vw] max-h-[75vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="flex items-center gap-2">
              <span className="text-white/40 text-xs">{googleLightboxIndex + 1} / {googlePhotos.length}</span>
              <div className="w-px h-4 bg-white/20" />
              <button
                onClick={() => {
                  const photo = googlePhotos[googleLightboxIndex];
                  saveGooglePhoto(photo.name, photo.url, false);
                  setGoogleLightboxIndex(null);
                }}
                disabled={!!savingGooglePhoto}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-semibold shadow-lg"
              >
                <Plus className="w-3.5 h-3.5" /> Add to gallery
              </button>
              <button
                onClick={() => {
                  const photo = googlePhotos[googleLightboxIndex];
                  saveGooglePhoto(photo.name, photo.url, true);
                  setGoogleLightboxIndex(null);
                }}
                disabled={!!savingGooglePhoto}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold shadow-lg"
              >
                <Star className="w-3.5 h-3.5" /> Set as hero
              </button>
              <button
                onClick={() => setGoogleLightboxIndex(null)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
              >
                <X className="w-3.5 h-3.5" /> Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main modal */}
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-2xl">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{listing.name}</h2>
              <p className="text-sm text-gray-500">{listing.city}, {listing.state}</p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:text-orange-600 hover:bg-orange-50 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View listing
              </a>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Hero section */}
          <div className="px-6 py-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Hero Image</p>
            {listing.hero_image ? (
              <div className="relative group rounded-xl overflow-hidden bg-gray-100 max-h-[400px]">
                <img
                  src={enhancedPreview ?? listing.hero_image}
                  alt={listing.name}
                  className="w-full object-contain max-h-[400px]"
                />
                {/* Enhanced preview badge + save button */}
                {enhancedPreview && (
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="px-2 py-1 rounded-full bg-purple-600 text-white text-xs font-medium shadow-lg">
                      Enhanced preview
                    </span>
                    <button
                      onClick={saveEnhancedHero}
                      disabled={enhancing}
                      className="px-3 py-1 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs font-medium shadow-lg transition-colors"
                    >
                      Save
                    </button>
                  </div>
                )}
                {/* Paste URL input (shown above hero when toggled) */}
                {pasteUrlOpen && (
                  <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-xl p-2 shadow-xl">
                    <input
                      ref={pasteInputRef}
                      type="text"
                      value={pasteUrlValue}
                      onChange={(e) => setPasteUrlValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handlePasteUrl(); if (e.key === 'Escape') setPasteUrlOpen(false); }}
                      placeholder="Paste image URL..."
                      className="flex-1 px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                    <button
                      onClick={handlePasteUrl}
                      disabled={pasteUrlLoading || !pasteUrlValue.trim()}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium disabled:opacity-50"
                    >
                      {pasteUrlLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Set as Hero
                    </button>
                    <button onClick={() => setPasteUrlOpen(false)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {/* Hero action buttons */}
                <div className="absolute top-3 right-3 flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className={`w-9 h-9 rounded-full text-white flex items-center justify-center shadow-lg transition-colors ${
                      uploading ? 'bg-orange-500 animate-pulse' : 'bg-gray-700/80 hover:bg-orange-600'
                    }`}
                    title="Upload new hero from disk"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setPasteUrlOpen(!pasteUrlOpen); setTimeout(() => pasteInputRef.current?.focus(), 100); }}
                    className={`w-9 h-9 rounded-full text-white flex items-center justify-center shadow-lg transition-colors ${
                      pasteUrlOpen ? 'bg-violet-500 hover:bg-violet-600' : 'bg-gray-700/80 hover:bg-violet-600'
                    }`}
                    title="Paste image URL"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleEnhance}
                    disabled={enhancing}
                    className={`w-9 h-9 rounded-full text-white flex items-center justify-center shadow-lg transition-colors ${
                      enhancing ? 'bg-purple-500 animate-pulse'
                        : enhancedPreview ? 'bg-purple-500 hover:bg-purple-600'
                        : 'bg-gray-700/80 hover:bg-purple-600'
                    }`}
                    title={enhancedPreview ? 'Show original' : 'Auto-enhance preview'}
                  >
                    <Wand2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCropOpen(true)}
                    className="w-9 h-9 rounded-full bg-gray-700/80 hover:bg-blue-600 text-white flex items-center justify-center shadow-lg transition-colors"
                    title="Crop hero"
                  >
                    <Crop className="w-4 h-4" />
                  </button>
                  {listing.google_place_id && (
                    <button
                      onClick={toggleGooglePhotos}
                      className={`w-9 h-9 rounded-full text-white flex items-center justify-center shadow-lg transition-colors ${
                        googlePhotosOpen ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-700/80 hover:bg-green-600'
                      }`}
                      title="Browse Google Place photos"
                    >
                      <ImagePlus className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={deleteHero}
                    disabled={saving}
                    className="w-9 h-9 rounded-full bg-gray-700/80 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-colors"
                    title="Delete hero"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {/* Source badge */}
                {listing.hero_image_source && (
                  <div className="absolute bottom-3 left-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-black/50 text-white font-medium backdrop-blur-sm">
                      {listing.hero_image_source.replace('_', ' ')}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 bg-gray-100 rounded-xl">
                <div className="text-center">
                  <ImageOff className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No hero image</p>
                  <p className="text-xs text-gray-400 mt-1">Click a gallery photo below or upload one</p>
                  <div className="mt-3 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium disabled:opacity-50"
                      >
                        <Upload className="w-4 h-4" /> Upload Photo
                      </button>
                      <button
                        onClick={() => { setPasteUrlOpen(!pasteUrlOpen); setTimeout(() => pasteInputRef.current?.focus(), 100); }}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium"
                      >
                        <Plus className="w-4 h-4" /> Paste URL
                      </button>
                      {listing.google_place_id && (
                        <button
                          onClick={toggleGooglePhotos}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
                        >
                          <ImagePlus className="w-4 h-4" /> Browse Google Photos
                        </button>
                      )}
                    </div>
                    {pasteUrlOpen && (
                      <div className="flex items-center gap-2 w-full max-w-lg">
                        <input
                          ref={pasteInputRef}
                          type="text"
                          value={pasteUrlValue}
                          onChange={(e) => setPasteUrlValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handlePasteUrl(); if (e.key === 'Escape') setPasteUrlOpen(false); }}
                          placeholder="Paste image URL here..."
                          className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                        <button
                          onClick={handlePasteUrl}
                          disabled={pasteUrlLoading || !pasteUrlValue.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium disabled:opacity-50"
                        >
                          {pasteUrlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          Set as Hero
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Google Place Photos panel */}
          {googlePhotosOpen && listing.google_place_id && (
            <div className="px-6 pb-4">
              <button
                onClick={toggleGooglePhotos}
                className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 hover:text-gray-700 transition-colors"
              >
                <ImagePlus className="w-3.5 h-3.5 text-green-600" />
                Google Place Photos (API)
                {googlePhotos && <span className="text-gray-400 normal-case font-normal">({googlePhotos.length} of {googlePhotosTotal})</span>}
                <ChevronUp className="w-3.5 h-3.5 ml-auto" />
              </button>
              {googlePhotosLoading && !googlePhotos?.length ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
                  <span className="ml-2 text-sm text-gray-500">Loading Google photos…</span>
                </div>
              ) : googlePhotos && googlePhotos.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No Google Place photos available</p>
              ) : googlePhotos ? (
                <>
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                    {googlePhotos.map((photo, idx) => {
                      const isSaving = savingGooglePhoto === photo.url;
                      return (
                        <div key={photo.name} className="relative flex-shrink-0 group">
                          <div
                            className="w-[160px] h-[120px] rounded-lg overflow-hidden bg-gray-100 cursor-pointer hover:ring-2 hover:ring-green-400 transition-shadow"
                            onClick={() => setGoogleLightboxIndex(idx)}
                          >
                            <img
                              src={photo.url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-opacity" />
                            </div>
                            {isSaving && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg">
                                <Loader2 className="w-6 h-6 text-white animate-spin" />
                              </div>
                            )}
                          </div>
                          {/* Overlay action buttons */}
                          {!isSaving && (
                            <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); saveGooglePhoto(photo.name, photo.url, false); }}
                                disabled={!!savingGooglePhoto}
                                className="w-7 h-7 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg"
                                title="Add to gallery"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); saveGooglePhoto(photo.name, photo.url, true); }}
                                disabled={!!savingGooglePhoto}
                                className="w-7 h-7 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center shadow-lg"
                                title="Set as hero image"
                              >
                                <Star className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Load more button inline in the strip */}
                    {googlePhotosHasMore && (
                      <button
                        onClick={() => fetchGooglePhotos(true)}
                        disabled={googlePhotosLoading}
                        className="flex-shrink-0 w-[120px] h-[120px] rounded-lg border-2 border-dashed border-green-300 hover:border-green-500 bg-green-50 hover:bg-green-100 flex flex-col items-center justify-center gap-1 transition-colors"
                      >
                        {googlePhotosLoading ? (
                          <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
                        ) : (
                          <>
                            <Plus className="w-5 h-5 text-green-600" />
                            <span className="text-xs text-green-700 font-medium">Load more</span>
                            <span className="text-[10px] text-green-500">{googlePhotosTotal - googlePhotos.length} remaining</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* Equipment section */}
          <div className="px-6 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Equipment</p>
              {listing.equipment_brand ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                  {EQUIPMENT_BRANDS.find(b => b.value === listing.equipment_brand)?.label ?? listing.equipment_brand}
                  {listing.equipment_model ? ` — ${listing.equipment_model}` : ''}
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Not classified</span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Brand selector */}
              <select
                value={listing.equipment_brand ?? ''}
                onChange={(e) => {
                  const val = e.target.value || null;
                  setEquipment(val, val ? listing.equipment_model : null);
                }}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                  listing.equipment_brand
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-white border-gray-300 text-gray-500'
                }`}
              >
                <option value="">Select manufacturer…</option>
                {EQUIPMENT_BRANDS.map(b => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>

              {/* Model selector — only show when brand is selected */}
              {listing.equipment_brand && (() => {
                const models = EQUIPMENT_MODELS[listing.equipment_brand] ?? [];
                const currentModel = listing.equipment_model ?? '';
                const isKnownModel = models.includes(currentModel);
                return (
                  <>
                    {models.length > 0 ? (
                      <select
                        value={isKnownModel ? currentModel : (currentModel ? '__other__' : '')}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__other__') {
                            // Will show text input — don't save yet
                            setListing(prev => prev ? { ...prev, equipment_model: '__other__' } : prev);
                          } else {
                            setEquipment(listing.equipment_brand, val || null);
                          }
                        }}
                        className={`text-sm px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                          listing.equipment_model && listing.equipment_model !== '__other__'
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                            : 'bg-white border-gray-300 text-gray-500'
                        }`}
                      >
                        <option value="">Select model…</option>
                        {models.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                        <option value="__other__">Other…</option>
                      </select>
                    ) : null}
                    {(currentModel === '__other__' || (currentModel && !isKnownModel) || models.length === 0) && (
                      <input
                        type="text"
                        placeholder="Enter model name…"
                        defaultValue={currentModel === '__other__' ? '' : currentModel}
                        onBlur={(e) => {
                          const val = e.target.value.trim() || null;
                          setEquipment(listing.equipment_brand, val);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') onClose();
                        }}
                        className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 w-40 bg-white focus:border-indigo-400 focus:outline-none"
                        autoFocus
                      />
                    )}
                  </>
                );
              })()}

              {/* Classify with AI button */}
              <button
                onClick={classifyWithAI}
                disabled={classifying}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium shadow-sm transition-colors ${
                  classifying
                    ? 'bg-violet-100 text-violet-500 cursor-wait'
                    : 'bg-violet-600 hover:bg-violet-700 text-white'
                }`}
              >
                {classifying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {classifying ? 'Classifying…' : 'Classify with AI'}
              </button>

              {/* AI result feedback */}
              {classifyResult && (
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  classifyResult.includes('not auto-saved') || classifyResult.includes('No equipment')
                    ? 'bg-amber-100 text-amber-700'
                    : classifyResult.includes('failed')
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'
                }`}>
                  {classifyResult}
                </span>
              )}
            </div>
            {/* AI evidence / reasoning */}
            {classifyEvidence && (
              <div className="mt-2 p-3 rounded-lg bg-violet-50 border border-violet-200">
                <p className="text-xs font-semibold text-violet-600 mb-1">AI Evidence:</p>
                <p className="text-xs text-violet-800 whitespace-pre-line leading-relaxed">{classifyEvidence}</p>
              </div>
            )}
          </div>

          {/* Gallery section */}
          <div className="px-6 pb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Gallery ({galleryPhotos.length} photos)
            </p>
            {galleryPhotos.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No gallery photos</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                {galleryPhotos.map((url, idx) => (
                  <div key={url} className="group relative">
                    <div
                      className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer hover:ring-2 hover:ring-orange-400 transition-shadow"
                      onClick={() => setLightboxIndex(idx)}
                    >
                      <Image src={url} alt="" fill className="object-cover" sizes="120px" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-opacity" />
                      </div>
                    </div>
                    {/* Enhancing overlay */}
                    {enhancingGalleryUrl === url && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg z-10">
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      </div>
                    )}
                    {/* Quick action buttons */}
                    <div className="absolute -bottom-1 left-0 right-0 flex gap-1 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setAsHero(url); }}
                        className="w-6 h-6 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-md"
                        title="Use as hero"
                      >
                        <Star className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); enhanceGalleryPhoto(url); }}
                        className="w-6 h-6 rounded-full bg-purple-500 hover:bg-purple-600 text-white flex items-center justify-center shadow-md"
                        title="Enhance photo"
                      >
                        <Wand2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setCropGalleryUrl(url); }}
                        className="w-6 h-6 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shadow-md"
                        title="Crop photo"
                      >
                        <Crop className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeGalleryPhoto(url); }}
                        className="w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md"
                        title="Delete photo"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Gallery add photo controls */}
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => {
                  setGalleryPasteOpen(!galleryPasteOpen);
                  if (!galleryPasteOpen) setTimeout(() => galleryPasteInputRef.current?.focus(), 100);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  galleryPasteOpen ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                }`}
              >
                <Plus className="w-3.5 h-3.5" /> Add Photo URL
              </button>
            </div>
            {galleryPasteOpen && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  ref={galleryPasteInputRef}
                  type="text"
                  value={galleryPasteValue}
                  onChange={(e) => setGalleryPasteValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGalleryPasteUrl();
                    if (e.key === 'Escape') setGalleryPasteOpen(false);
                  }}
                  placeholder="Paste image or Google Maps URL..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  disabled={galleryPasteLoading}
                />
                <button
                  onClick={handleGalleryPasteUrl}
                  disabled={!galleryPasteValue.trim() || galleryPasteLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {galleryPasteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add to Gallery
                </button>
              </div>
            )}
          </div>

          {/* Footer with actions */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={markNotTouchless}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 text-sm font-medium disabled:opacity-50 transition-colors"
                title="Mark as not touchless"
              >
                <Ban className="w-4 h-4" /> Not Touchless
              </button>
              <button
                onClick={deleteListing}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium disabled:opacity-50 transition-colors"
                title="Delete this listing"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
              <button
                onClick={openStreetView}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm font-medium transition-colors"
                title="Open Google Street View"
              >
                <MapPin className="w-4 h-4" /> Street View
              </button>
              {listing.website && (
                <button
                  onClick={() => window.open(listing.website!, '_blank')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-700 text-sm font-medium transition-colors"
                  title="Open car wash website"
                >
                  <Globe className="w-4 h-4" /> Website
                </button>
              )}
              {listing.google_place_id && (
                <button
                  onClick={() => {
                    window.open(`https://www.google.com/maps/place/?q=place_id:${listing.google_place_id}`, '_blank');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 text-sm font-medium transition-colors"
                  title="Browse Google Photos in new tab"
                >
                  <ImageIcon className="w-4 h-4" /> Google Photos
                </button>
              )}
            </div>
            <button
              onClick={dismissAudit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium shadow-sm disabled:opacity-50 transition-colors"
            >
              <Check className="w-4 h-4" /> {onNext ? 'Looks Good → Next' : 'Looks Good — Dismiss'}
            </button>
          </div>
        </div>
      </div>

      {/* Crop modal — rendered last so it layers on top of everything */}
      {cropOpen && listing.hero_image && (
        <CropModal
          imageUrl={listing.hero_image}
          listingId={listing.id}
          onSave={handleCropSave}
          onClose={() => setCropOpen(false)}
          zIndex={60}
        />
      )}

      {/* Gallery crop modal */}
      {cropGalleryUrl && (
        <CropModal
          imageUrl={cropGalleryUrl}
          listingId={listing.id}
          uploadType="gallery"
          onSave={handleGalleryCropSave}
          onClose={() => setCropGalleryUrl(null)}
          zIndex={60}
        />
      )}
    </>
  );
}
