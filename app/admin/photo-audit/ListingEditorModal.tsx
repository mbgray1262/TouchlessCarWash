'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Star, Trash2, Crop, Wand2, ZoomIn, ChevronLeft, ChevronRight, ImageOff, ExternalLink, Check, Upload } from 'lucide-react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { CropModal } from '../hero-review/CropModal';
import { autoEnhanceImage } from '../hero-review/autoEnhance';
import { getStateSlug, slugify } from '@/lib/constants';

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
}

interface Props {
  listingId: string;
  onClose: () => void;
  onUpdate?: () => void; // callback to refresh parent data
}

export function ListingEditorModal({ listingId, onClose, onUpdate }: Props) {
  const [listing, setListing] = useState<ListingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [preEnhance, setPreEnhance] = useState<{ url: string; source: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadListing = useCallback(async () => {
    const { data } = await supabase
      .from('listings')
      .select('id, name, hero_image, hero_image_source, photos, city, state, slug, google_photo_url, street_view_url, blocked_photos')
      .eq('id', listingId)
      .maybeSingle();
    if (data) setListing(data as ListingData);
    setLoading(false);
  }, [listingId]);

  useEffect(() => { loadListing(); }, [loadListing]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightboxIndex === null && !cropOpen) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, lightboxIndex, cropOpen]);

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
  const galleryPhotos = allPhotos.filter(p => p !== heroBase);

  // ─── Actions ────────────────────────────────────────────────────

  const setAsHero = async (url: string, source: string = 'gallery') => {
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

    await supabase.from('listings').update({
      hero_image: url,
      hero_image_source: source,
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

    await supabase.from('listings').update({
      hero_image: null,
      hero_image_source: null,
      blocked_photos: newBlocked,
    }).eq('id', listing.id);

    setListing(prev => prev ? { ...prev, hero_image: null, hero_image_source: null, blocked_photos: newBlocked } : prev);
    setPreEnhance(null);
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
    setCropOpen(false);
    revalidate();
    onUpdate?.();
    setSaving(false);
  };

  const handleEnhance = async () => {
    if (!listing.hero_image || enhancing) return;
    setEnhancing(true);
    try {
      if (preEnhance) {
        // Revert — swap enhanced URL back to original in photos array
        const currentPhotos = listing.photos ?? [];
        const revertedPhotos = currentPhotos.map(p => p === listing.hero_image ? preEnhance.url : p);

        await supabase.from('listings').update({
          hero_image: preEnhance.url,
          hero_image_source: preEnhance.source,
          photos: revertedPhotos,
        }).eq('id', listing.id);
        setListing(prev => prev ? { ...prev, hero_image: preEnhance.url, hero_image_source: preEnhance.source, photos: revertedPhotos } : prev);
        setPreEnhance(null);
      } else {
        // Enhance
        const originalUrl = listing.hero_image;
        const originalSource = listing.hero_image_source;
        const blob = await autoEnhanceImage(originalUrl);
        const formData = new FormData();
        formData.append('file', blob, 'enhanced-hero.jpg');
        formData.append('listingId', listing.id);
        formData.append('type', 'hero');

        const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
        if (!res.ok) throw new Error(await res.text());
        const { url } = await res.json() as { url: string };

        // Replace old hero URL in photos array to avoid duplicate gallery entries
        const currentPhotos = listing.photos ?? [];
        const updatedPhotos = currentPhotos.map(p => p === originalUrl ? url : p);

        await supabase.from('listings').update({
          hero_image: url,
          hero_image_source: 'gallery',
          photos: updatedPhotos,
        }).eq('id', listing.id);

        setListing(prev => prev ? { ...prev, hero_image: url, hero_image_source: 'gallery', photos: updatedPhotos } : prev);
        setPreEnhance({ url: originalUrl, source: originalSource });
      }
      revalidate();
      onUpdate?.();
    } catch (err) {
      console.error('Enhance failed:', err);
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
      revalidate();
      onUpdate?.();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
    onClose();
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
                  src={listing.hero_image}
                  alt={listing.name}
                  className="w-full object-contain max-h-[400px]"
                />
                {/* Hero action buttons */}
                <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                    onClick={handleEnhance}
                    disabled={enhancing}
                    className={`w-9 h-9 rounded-full text-white flex items-center justify-center shadow-lg transition-colors ${
                      enhancing ? 'bg-purple-500 animate-pulse'
                        : preEnhance ? 'bg-purple-500 hover:bg-purple-600'
                        : 'bg-gray-700/80 hover:bg-purple-600'
                    }`}
                    title={preEnhance ? 'Revert to original' : 'Auto-enhance'}
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
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium mx-auto disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" /> Upload Photo
                  </button>
                </div>
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
          </div>

          {/* Footer with dismiss action */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex items-center justify-between">
            <p className="text-xs text-gray-400">Dismiss this listing from the review queue</p>
            <button
              onClick={dismissAudit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium shadow-sm disabled:opacity-50 transition-colors"
            >
              <Check className="w-4 h-4" /> Looks Good — Dismiss
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
    </>
  );
}
