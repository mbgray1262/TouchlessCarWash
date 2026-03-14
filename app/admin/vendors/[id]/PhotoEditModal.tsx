'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  Crop,
  Wand2,
  Trash2,
  Star,
  ChevronLeft,
  ChevronRight,
  Upload,
  Loader2,
  ZoomIn,
  ImageIcon,
  Camera,
  Check,
  RotateCw,
  Download,
} from 'lucide-react';
import ReactCrop, {
  type Crop as CropType,
  type PixelCrop,
  centerCrop,
  makeAspectCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { autoEnhanceImage } from '@/app/admin/hero-review/autoEnhance';
import { supabase } from '@/lib/supabase';

// ─── Types ─────────────────────────────────────────────────

interface PhotoEditListing {
  id: string;
  name: string;
  hero_image: string | null;
  photos: string[] | null;
}

interface PhotoEditModalProps {
  listing: PhotoEditListing;
  open: boolean;
  onClose: () => void;
  onUpdate: (updated: { hero_image: string | null; photos: string[] | null }) => void;
}

// ─── Crop helpers ──────────────────────────────────────────

const ASPECT_OPTIONS = [
  { label: '16:9', value: 16 / 9 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: 'Free', value: undefined },
];

function centerAspectCrop(width: number, height: number, aspect: number): CropType {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height),
    width,
    height,
  );
}

async function getCroppedBlob(image: HTMLImageElement, pixelCrop: PixelCrop): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = pixelCrop.width * scaleX;
  canvas.height = pixelCrop.height * scaleY;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    pixelCrop.width * scaleX,
    pixelCrop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => { if (blob) resolve(blob); else reject(new Error('Canvas is empty')); },
      'image/jpeg',
      0.92,
    );
  });
}

// ─── Component ─────────────────────────────────────────────

export default function PhotoEditModal({ listing, open, onClose, onUpdate }: PhotoEditModalProps) {
  const [heroImage, setHeroImage] = useState<string | null>(listing.hero_image);
  const [photos, setPhotos] = useState<string[]>(listing.photos ?? []);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null); // index into gallery (photos array)
  const [mode, setMode] = useState<'view' | 'crop'>('view');

  // Crop state
  const cropImgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<CropType>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [cropAspect, setCropAspect] = useState<number | undefined>(16 / 9);
  const [cropTarget, setCropTarget] = useState<'hero' | number>('hero'); // 'hero' or gallery index

  // Action states
  const [saving, setSaving] = useState(false);
  const [enhancing, setEnhancing] = useState<string | null>(null); // URL being enhanced
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const uploadRef = useRef<HTMLInputElement>(null);

  // Sync when listing changes
  useEffect(() => {
    setHeroImage(listing.hero_image);
    setPhotos(listing.photos ?? []);
    setSelectedIndex(null);
    setMode('view');
  }, [listing.id, listing.hero_image, listing.photos]);

  // The image currently being viewed full-size
  const viewingUrl = selectedIndex !== null ? photos[selectedIndex] : heroImage;
  const viewingIsHero = selectedIndex === null;

  // Gallery photos that aren't the hero
  const galleryPhotos = photos.filter((p) => p !== heroImage);

  // ─── Keyboard navigation ────────────────────────────────

  useEffect(() => {
    if (!open || mode === 'crop') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigatePrev();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, mode, selectedIndex, photos, heroImage]);

  const navigatePrev = useCallback(() => {
    if (selectedIndex === null) return; // already on hero, can't go further left
    if (selectedIndex === 0) {
      setSelectedIndex(null); // go back to hero
    } else {
      setSelectedIndex((selectedIndex ?? 1) - 1);
    }
  }, [selectedIndex]);

  const navigateNext = useCallback(() => {
    if (selectedIndex === null) {
      if (galleryPhotos.length > 0) setSelectedIndex(photos.indexOf(galleryPhotos[0]));
    } else if (selectedIndex < photos.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  }, [selectedIndex, galleryPhotos, photos]);

  // ─── Save to database helper ─────────────────────────────

  const persistUpdate = useCallback(async (newHero: string | null, newPhotos: string[]) => {
    const { error } = await supabase
      .from('listings')
      .update({ hero_image: newHero, photos: newPhotos })
      .eq('id', listing.id);
    if (error) throw error;
    onUpdate({ hero_image: newHero, photos: newPhotos });
  }, [listing.id, onUpdate]);

  // ─── Actions ─────────────────────────────────────────────

  const handleSetAsHero = async (url: string) => {
    setSaving(true);
    try {
      const newPhotos = [...photos];
      // Add old hero to photos if it exists and isn't already there
      if (heroImage && !newPhotos.includes(heroImage)) {
        newPhotos.push(heroImage);
      }
      setHeroImage(url);
      setPhotos(newPhotos);
      setSelectedIndex(null);
      await persistUpdate(url, newPhotos);
    } catch {
      // revert
      setHeroImage(listing.hero_image);
      setPhotos(listing.photos ?? []);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHero = async () => {
    if (!heroImage) return;
    setSaving(true);
    try {
      const newPhotos = photos.filter((p) => p !== heroImage);
      setHeroImage(null);
      setPhotos(newPhotos);
      setSelectedIndex(null);
      await persistUpdate(null, newPhotos);
    } catch {
      setHeroImage(listing.hero_image);
      setPhotos(listing.photos ?? []);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGalleryPhoto = async (url: string) => {
    setDeleting(url);
    try {
      const newPhotos = photos.filter((p) => p !== url);
      const newHero = heroImage === url ? null : heroImage;
      setPhotos(newPhotos);
      if (heroImage === url) setHeroImage(null);
      if (selectedIndex !== null) {
        if (selectedIndex >= newPhotos.length) {
          setSelectedIndex(newPhotos.length > 0 ? newPhotos.length - 1 : null);
        }
      }
      await persistUpdate(newHero, newPhotos);
    } catch {
      setPhotos(listing.photos ?? []);
      setHeroImage(listing.hero_image);
    } finally {
      setDeleting(null);
    }
  };

  const handleEnhance = async (url: string) => {
    setEnhancing(url);
    try {
      const blob = await autoEnhanceImage(url);
      // Upload enhanced image
      const formData = new FormData();
      formData.append('file', blob, 'enhanced.jpg');
      formData.append('listingId', listing.id);
      formData.append('type', url === heroImage ? 'hero' : 'gallery');

      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const { url: enhancedUrl } = await res.json();

      // Replace the old URL with enhanced
      const newPhotos = photos.map((p) => (p === url ? enhancedUrl : p));
      const newHero = heroImage === url ? enhancedUrl : heroImage;

      setPhotos(newPhotos);
      setHeroImage(newHero);
      if (selectedIndex !== null && photos[selectedIndex] === url) {
        // keep same index — URL just changed
      }

      await persistUpdate(newHero, newPhotos);
    } catch (err) {
      alert(`Enhance failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setEnhancing(null);
    }
  };

  // ─── Crop flow ───────────────────────────────────────────

  const openCrop = (target: 'hero' | number) => {
    setCropTarget(target);
    setCropAspect(16 / 9);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setMode('crop');
  };

  const onCropImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    if (cropAspect) {
      setCrop(centerAspectCrop(width, height, cropAspect));
    } else {
      setCrop({ unit: '%', x: 5, y: 5, width: 90, height: 90 });
    }
  }, [cropAspect]);

  const handleCropAspectChange = (newAspect: number | undefined) => {
    setCropAspect(newAspect);
    if (cropImgRef.current) {
      const { width, height } = cropImgRef.current;
      if (newAspect) {
        setCrop(centerAspectCrop(width, height, newAspect));
      } else {
        setCrop({ unit: '%', x: 5, y: 5, width: 90, height: 90 });
      }
    }
  };

  const handleCropSave = async () => {
    if (!completedCrop || !cropImgRef.current) return;
    setSaving(true);
    try {
      const blob = await getCroppedBlob(cropImgRef.current, completedCrop);
      const formData = new FormData();
      formData.append('file', blob, 'cropped.jpg');
      formData.append('listingId', listing.id);
      formData.append('type', cropTarget === 'hero' ? 'hero' : 'gallery');

      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const { url: croppedUrl } = await res.json();

      const oldUrl = cropTarget === 'hero' ? heroImage : photos[cropTarget as number];
      const newPhotos = photos.map((p) => (p === oldUrl ? croppedUrl : p));
      const newHero = cropTarget === 'hero' ? croppedUrl : (heroImage === oldUrl ? croppedUrl : heroImage);

      setPhotos(newPhotos);
      setHeroImage(newHero);
      await persistUpdate(newHero, newPhotos);
      setMode('view');
    } catch (err) {
      alert(`Crop failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Upload ──────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file, file.name);
      formData.append('listingId', listing.id);
      formData.append('type', 'gallery');

      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();

      // If no hero image exists, set the uploaded photo as the hero
      if (!heroImage) {
        setHeroImage(url);
        await persistUpdate(url, photos);
      } else {
        const newPhotos = [...photos, url];
        setPhotos(newPhotos);
        await persistUpdate(heroImage, newPhotos);
      }
    } catch (err) {
      alert(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  if (!open) return null;

  const cropImageUrl =
    cropTarget === 'hero' ? heroImage : (typeof cropTarget === 'number' ? photos[cropTarget] : null);

  // ─── Render: Crop Mode ───────────────────────────────────

  if (mode === 'crop' && cropImageUrl) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col" onClick={() => setMode('view')}>
        <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2">
              <Crop className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-semibold text-white">Crop Image</h2>
            </div>
            <button
              onClick={() => setMode('view')}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Aspect ratio bar */}
          <div className="flex items-center gap-2 px-5 py-2">
            <span className="text-xs text-white/50 font-medium mr-1">Aspect:</span>
            {ASPECT_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => handleCropAspectChange(opt.value)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  cropAspect === opt.value
                    ? 'bg-orange-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Crop area */}
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={cropAspect}
              minWidth={50}
              minHeight={50}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={cropImgRef}
                src={cropImageUrl}
                alt="Crop preview"
                onLoad={onCropImageLoad}
                crossOrigin="anonymous"
                className="max-w-full max-h-[60vh] object-contain"
              />
            </ReactCrop>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4">
            <p className="text-xs text-white/40">
              {completedCrop && cropImgRef.current
                ? `${Math.round(completedCrop.width * (cropImgRef.current.naturalWidth / cropImgRef.current.width))} × ${Math.round(completedCrop.height * (cropImgRef.current.naturalHeight / cropImgRef.current.height))} px`
                : 'Drag to adjust crop area'}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMode('view')}
                className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCropSave}
                disabled={!completedCrop || saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving...</>
                ) : (
                  <><Check className="w-3.5 h-3.5" />Save Crop</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: View Mode ───────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <input
        ref={uploadRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={handleFileUpload}
      />

      <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Camera className="w-4 h-4 text-blue-400 shrink-0" />
            <h2 className="text-sm font-semibold text-white truncate">{listing.name}</h2>
            <span className="text-xs text-white/40 shrink-0">
              {viewingIsHero ? 'Hero Image' : `Gallery ${(selectedIndex ?? 0) + 1} / ${photos.length}`}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
            title="Close (Esc)"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Main image area */}
        <div className="flex-1 flex items-center justify-center relative min-h-0 px-12">
          {/* Prev arrow */}
          {(selectedIndex !== null) && (
            <button
              onClick={navigatePrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
              title="Previous (←)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {/* Next arrow */}
          {(selectedIndex === null ? galleryPhotos.length > 0 : (selectedIndex ?? 0) < photos.length - 1) && (
            <button
              onClick={navigateNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
              title="Next (→)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {viewingUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={viewingUrl}
              alt={viewingIsHero ? 'Hero image' : 'Gallery photo'}
              className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-2xl"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="w-80 h-52 bg-gray-800 rounded-lg flex flex-col items-center justify-center gap-3">
              <Camera className="w-12 h-12 text-gray-600" />
              <p className="text-sm text-gray-500">No hero image set</p>
              <button
                onClick={() => uploadRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Photo
              </button>
            </div>
          )}
        </div>

        {/* Action toolbar */}
        {viewingUrl && (
          <div className="flex items-center justify-center gap-2 py-3 shrink-0">
            {/* Crop */}
            <button
              onClick={() => openCrop(viewingIsHero ? 'hero' : selectedIndex!)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
              title="Crop image"
            >
              <Crop className="w-3.5 h-3.5" />
              Crop
            </button>

            {/* Enhance */}
            <button
              onClick={() => handleEnhance(viewingUrl)}
              disabled={enhancing === viewingUrl}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors disabled:opacity-50"
              title="Auto-enhance (magic wand)"
            >
              {enhancing === viewingUrl ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />Enhancing...</>
              ) : (
                <><Wand2 className="w-3.5 h-3.5" />Enhance</>
              )}
            </button>

            {/* Set as Hero (only for gallery images) */}
            {!viewingIsHero && (
              <button
                onClick={() => handleSetAsHero(viewingUrl)}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                title="Set as hero image"
              >
                {saving ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />Setting...</>
                ) : (
                  <><Star className="w-3.5 h-3.5" />Set as Hero</>
                )}
              </button>
            )}

            {/* Delete */}
            <button
              onClick={() => viewingIsHero ? handleDeleteHero() : handleDeleteGalleryPhoto(viewingUrl)}
              disabled={deleting === viewingUrl || saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-sm transition-colors disabled:opacity-50"
              title="Delete image"
            >
              {deleting === viewingUrl ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />Deleting...</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5" />Delete</>
              )}
            </button>
          </div>
        )}

        {/* Thumbnail strip */}
        <div className="shrink-0 border-t border-white/10 px-5 py-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {/* Hero thumbnail */}
            <button
              onClick={() => setSelectedIndex(null)}
              className={`relative shrink-0 w-20 h-14 rounded-md overflow-hidden border-2 transition-all ${
                viewingIsHero ? 'border-orange-400 shadow-lg shadow-orange-400/30' : 'border-transparent hover:border-white/30'
              }`}
              title="Hero image"
            >
              {heroImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={heroImage} alt="Hero" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                  <Camera className="w-4 h-4 text-gray-600" />
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1 pb-0.5">
                <span className="text-[9px] text-white font-semibold flex items-center gap-0.5">
                  <Star className="w-2 h-2 fill-current" />
                  Hero
                </span>
              </div>
            </button>

            {/* Divider */}
            {photos.length > 0 && (
              <div className="w-px h-10 bg-white/20 shrink-0" />
            )}

            {/* Gallery thumbnails */}
            {photos.map((url, idx) => {
              if (url === heroImage) return null; // skip hero from gallery strip
              const isActive = selectedIndex === idx;
              return (
                <button
                  key={url}
                  onClick={() => setSelectedIndex(idx)}
                  className={`relative shrink-0 w-20 h-14 rounded-md overflow-hidden border-2 transition-all ${
                    isActive ? 'border-blue-400 shadow-lg shadow-blue-400/30' : 'border-transparent hover:border-white/30'
                  }`}
                  title={`Gallery photo ${idx + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Gallery ${idx + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </button>
              );
            })}

            {/* Upload button */}
            <button
              onClick={() => uploadRef.current?.click()}
              disabled={uploading}
              className="shrink-0 w-20 h-14 rounded-md border-2 border-dashed border-white/20 hover:border-white/40 flex flex-col items-center justify-center gap-0.5 transition-colors"
              title="Upload a new photo"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
              ) : (
                <>
                  <Upload className="w-4 h-4 text-white/40" />
                  <span className="text-[9px] text-white/40">Upload</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
