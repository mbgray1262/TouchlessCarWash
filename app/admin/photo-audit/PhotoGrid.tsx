'use client';

import { useState, useRef } from 'react';
import { Star, Image as ImageIcon, Cpu, X, Crop, Wand2, ZoomIn, ImageOff, Plus, Trash2, Loader2, MapPin, Upload } from 'lucide-react';
import type { CandidatePhoto, PhotoTag } from './useFastCuration';

interface PhotoGridProps {
  candidates: CandidatePhoto[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onTag: (id: string, tag: PhotoTag) => void;
  onSetAsHero: (id: string) => void;
  onAddToGallery: (id: string) => void;
  onRemoveFromGallery: (id: string) => void;
  onRemoveHero: () => void;
  onSkipPhoto: (id: string) => void;
  onCrop: (photo: CandidatePhoto) => void;
  onEnhance: (photo: CandidatePhoto) => void;
  discovering: boolean;
  enhancingId?: string | null;
  enhancedIds?: string[];
  equipmentSlot?: React.ReactNode;
  // Street View / Google Photos hero shortcut
  streetViewUrl?: string;
  googlePhotosUrl?: string;
  listingId?: string;
  onHeroDropped?: (url: string) => void;
  onStreetViewOpened?: () => void;
  onFallbackHero?: () => void;
  hasHeroImage?: boolean;
  // Chain brand fallback: shown when no location-specific hero is chosen
  chainBrandImageUrl?: string | null;
  chainBrandName?: string;
  // Clipboard paste handler (called when user clicks the empty hero area)
  onClipboardPaste?: (blob: Blob) => void;
  // Paste-target toggle: where the next pasted/captured screenshot goes.
  pasteTarget?: 'hero' | 'gallery';
  onPasteTargetChange?: (t: 'hero' | 'gallery') => void;
}

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  existing: { label: 'Existing', color: 'bg-gray-600' },
  google_places: { label: 'Google', color: 'bg-blue-600' },
  google_maps: { label: 'Google Maps', color: 'bg-blue-500' },
  google_search: { label: 'Google', color: 'bg-purple-600' },
  bing_search: { label: 'Bing', color: 'bg-cyan-600' },
  website: { label: 'Website', color: 'bg-teal-600' },
  street_view: { label: 'Street View', color: 'bg-orange-600' },
  capture: { label: 'Captured', color: 'bg-orange-500' },
  upload: { label: 'Uploaded', color: 'bg-indigo-600' },
};

export function PhotoGrid({
  candidates, selectedId, onSelect, onTag,
  onSetAsHero, onAddToGallery, onRemoveFromGallery, onRemoveHero, onSkipPhoto,
  onCrop, onEnhance, discovering, enhancingId, enhancedIds = [], equipmentSlot,
  streetViewUrl, googlePhotosUrl, listingId, onHeroDropped, onStreetViewOpened, onFallbackHero, hasHeroImage,
  chainBrandImageUrl, chainBrandName, onClipboardPaste,
  pasteTarget = 'hero', onPasteTargetChange,
}: PhotoGridProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [heroDragging, setHeroDragging] = useState(false);
  const [heroUploading, setHeroUploading] = useState(false);
  const heroDragCounter = useRef(0);
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  // Auto-crop to 16:9 and upload as hero
  const processHeroDrop = async (file: File) => {
    if (!listingId || !onHeroDropped) return;
    setHeroUploading(true);
    try {
      // Load the image to get dimensions
      const bitmap = await createImageBitmap(file);
      const { width, height } = bitmap;

      // Calculate 16:9 crop (center crop)
      const targetAspect = 16 / 9;
      const currentAspect = width / height;
      let srcX = 0, srcY = 0, srcW = width, srcH = height;
      if (currentAspect > targetAspect) {
        // Image is wider — crop sides
        srcW = Math.round(height * targetAspect);
        srcX = Math.round((width - srcW) / 2);
      } else {
        // Image is taller — crop top/bottom
        srcH = Math.round(width / targetAspect);
        srcY = Math.round((height - srcH) / 2);
      }

      // Draw cropped image to canvas at full resolution
      const canvas = document.createElement('canvas');
      canvas.width = srcW;
      canvas.height = srcH;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

      // Export as PNG for lossless quality
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas empty')), 'image/png');
      });

      // Upload
      const formData = new FormData();
      formData.append('file', blob, 'hero-streetview.png');
      formData.append('listingId', listingId);
      formData.append('type', 'hero');
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      onHeroDropped(url);
    } catch (err) {
      console.error('Hero drop failed:', err);
      alert('Failed to upload hero image. Please try again.');
    } finally {
      setHeroUploading(false);
    }
  };

  const heroPhoto = candidates.find(c => c.tag === 'hero');
  const galleryPhotos = candidates.filter(c => c.tag === 'gallery');
  const equipmentPhoto = candidates.find(c => c.tag === 'equipment');
  const untaggedPhotos = candidates.filter(c => !c.tag || c.tag === null);
  const skippedPhotos = candidates.filter(c => c.tag === 'skip');

  if (discovering && candidates.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <div className="animate-spin w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full mr-3" />
        Discovering photos from all sources...
      </div>
    );
  }

  const renderBadge = (photo: CandidatePhoto) => {
    const badge = SOURCE_BADGES[photo.source] ?? { label: photo.source, color: 'bg-gray-500' };
    if (photo.sourceUrl) {
      return (
        <a
          href={photo.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${badge.color} hover:opacity-80 cursor-pointer`}
          title={`View source: ${photo.sourceUrl}`}
        >
          {badge.label}
        </a>
      );
    }
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* ═══ HERO SECTION ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Star className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Hero Image</h3>
          <div className="ml-auto flex items-center gap-2">
            {/* Paste-target toggle — decides where the NEXT pasted/captured
                screenshot lands. Hero auto-crops to 16:9; Gallery keeps the
                screenshot's natural orientation (tall wand-bay shots stay tall). */}
            {onPasteTargetChange && (
              <div className="flex items-center gap-1.5 mr-1 pr-2 border-r border-gray-200">
                <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Paste to</span>
                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => onPasteTargetChange('hero')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors ${pasteTarget === 'hero' ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                    title="Pasted/captured screenshots become the HERO, auto-cropped to 16:9"
                  >
                    <Star className="w-3.5 h-3.5" /> Hero
                  </button>
                  <button
                    type="button"
                    onClick={() => onPasteTargetChange('gallery')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors ${pasteTarget === 'gallery' ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                    title="Pasted/captured screenshots are ADDED to the gallery at natural orientation (tall or wide) — never touches the hero"
                  >
                    <ImageIcon className="w-3.5 h-3.5" /> Gallery
                  </button>
                </div>
              </div>
            )}
            {onFallbackHero && !hasHeroImage && (
              <button
                onClick={onFallbackHero}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-400 hover:bg-gray-500 text-white text-xs font-medium transition-colors"
                title="No suitable hero found — use generic fallback image"
              >
                Use Fallback
              </button>
            )}
            {googlePhotosUrl && (
              <a
                href={googlePhotosUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onStreetViewOpened?.()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition-colors"
                title="Browse Google Maps photos, screenshot one (⌘+Ctrl+Shift+4), then switch back — applied to your selected Paste-to target (Hero or Gallery)"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Google Photos
              </a>
            )}
            {streetViewUrl && (
              <a
                href={streetViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onStreetViewOpened?.()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium transition-colors"
                title="Open Street View, take screenshot (⌘+Ctrl+Shift+4), then switch back — applied to your selected Paste-to target (Hero or Gallery)"
              >
                <MapPin className="w-3.5 h-3.5" />
                Street View
              </a>
            )}
            {onHeroDropped && (
              <>
                <input
                  ref={heroFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) await processHeroDrop(file);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => heroFileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition-colors"
                  title="Upload a screenshot directly as hero image (auto-crops to 16:9)"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload Hero
                </button>
              </>
            )}
          </div>
        </div>
        {heroPhoto ? (
          <div
            className={`relative group rounded-xl overflow-hidden bg-gray-100 border-2 ${heroDragging ? 'border-orange-400 ring-4 ring-orange-200' : 'border-amber-400'}`}
            onDragEnter={(e) => { e.preventDefault(); heroDragCounter.current++; setHeroDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDragLeave={(e) => { e.preventDefault(); heroDragCounter.current--; if (heroDragCounter.current <= 0) { heroDragCounter.current = 0; setHeroDragging(false); } }}
            onDrop={async (e) => {
              e.preventDefault(); e.stopPropagation();
              heroDragCounter.current = 0; setHeroDragging(false);
              const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
              if (file) await processHeroDrop(file);
            }}
          >
            {heroUploading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
                <div className="flex items-center gap-2 text-white font-medium">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Cropping & uploading...
                </div>
              </div>
            )}
            {heroDragging && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-orange-50/90 border-4 border-dashed border-orange-400 rounded-xl">
                <div className="text-center">
                  <Upload className="w-10 h-10 text-orange-500 mx-auto mb-1" />
                  <p className="text-sm font-semibold text-orange-700">Drop to replace hero</p>
                  <p className="text-xs text-orange-500">Auto-crops to 16:9</p>
                </div>
              </div>
            )}
            <div className="aspect-video relative">
              <img
                key={heroPhoto.id}
                src={heroPhoto.url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth < 600 || img.naturalHeight < 400) {
                    const warn = img.parentElement?.querySelector('.low-res-warn');
                    if (!warn) {
                      const el = document.createElement('div');
                      el.className = 'low-res-warn absolute bottom-2 left-2 px-2 py-1 bg-red-600 text-white text-xs font-bold rounded';
                      el.textContent = `⚠ Low res (${img.naturalWidth}×${img.naturalHeight})`;
                      img.parentElement?.appendChild(el);
                    }
                  }
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement;
                  if (parent && !parent.querySelector('.broken-placeholder')) {
                    const el = document.createElement('div');
                    el.className = 'broken-placeholder absolute inset-0 flex items-center justify-center bg-gray-200 text-gray-400 text-sm';
                    el.textContent = '⚠ Image failed to load';
                    parent.appendChild(el);
                  }
                }}
              />
            </div>
            {/* Source badge */}
            <div className="absolute top-2 left-2">{renderBadge(heroPhoto)}</div>
            {/* Tools */}
            <div className="absolute top-2 right-2 flex gap-1.5">
              <button
                onClick={() => onCrop(heroPhoto)}
                className="w-8 h-8 rounded-full bg-black/50 hover:bg-blue-600 text-white flex items-center justify-center transition-colors"
                title="Crop"
              >
                <Crop className="w-4 h-4" />
              </button>
              <button
                onClick={() => onEnhance(heroPhoto)}
                disabled={enhancingId === heroPhoto.id}
                className={`w-8 h-8 rounded-full text-white flex items-center justify-center transition-colors ${
                  enhancingId === heroPhoto.id ? 'bg-purple-600 animate-pulse' :
                  enhancedIds.includes(heroPhoto.id) ? 'bg-purple-600' :
                  'bg-black/50 hover:bg-purple-600'
                }`}
                title={enhancingId === heroPhoto.id ? 'Enhancing...' : enhancedIds.includes(heroPhoto.id) ? 'Enhanced' : 'Enhance'}
              >
                {enhancingId === heroPhoto.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              </button>
              <button
                onClick={onRemoveHero}
                className="w-8 h-8 rounded-full bg-black/50 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                title="Remove as hero"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`aspect-video rounded-xl border-2 border-dashed ${heroDragging ? 'border-orange-400 bg-orange-50 ring-4 ring-orange-200' : 'border-gray-300 bg-gray-50'} flex flex-col items-center justify-center text-gray-400 transition-colors overflow-hidden`}
            onDragEnter={(e) => { e.preventDefault(); heroDragCounter.current++; setHeroDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDragLeave={(e) => { e.preventDefault(); heroDragCounter.current--; if (heroDragCounter.current <= 0) { heroDragCounter.current = 0; setHeroDragging(false); } }}
            onDrop={async (e) => {
              e.preventDefault(); e.stopPropagation();
              heroDragCounter.current = 0; setHeroDragging(false);
              const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
              if (file) await processHeroDrop(file);
            }}
            onClick={async () => {
              if (!onClipboardPaste) return;
              try {
                const clipboardItems = await navigator.clipboard.read();
                for (const item of clipboardItems) {
                  const imageType = item.types.find(t => t.startsWith('image/'));
                  if (imageType) {
                    const blob = await item.getType(imageType);
                    onClipboardPaste(blob);
                    return;
                  }
                }
              } catch {
                // Clipboard read permission denied or no image — Cmd+V still works
              }
            }}
            title={onClipboardPaste ? 'Click to paste clipboard image, or drag & drop a file here' : undefined}
          >
            {heroUploading ? (
              <div className="flex items-center gap-2 text-orange-600">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-sm font-medium">Cropping & uploading...</p>
              </div>
            ) : heroDragging ? (
              <>
                <Upload className="w-10 h-10 text-orange-500 mb-2" />
                <p className="text-sm font-semibold text-orange-600">Drop screenshot here</p>
                <p className="text-xs text-orange-400">Auto-crops to 16:9</p>
              </>
            ) : chainBrandImageUrl ? (
              // Chain brand fallback — this is what visitors see on the public page
              // Clicking pastes clipboard image as the new hero
              <div className="relative w-full h-full cursor-pointer group/brand">
                <img
                  src={chainBrandImageUrl}
                  alt={chainBrandName ?? 'Brand default'}
                  className="w-full h-full object-cover opacity-60 group-hover/brand:opacity-40 transition-opacity"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 group-hover/brand:bg-black/50 transition-colors">
                  <p className="text-white text-sm font-semibold drop-shadow">Brand default ({chainBrandName})</p>
                  <p className="text-white/80 text-xs mt-1 drop-shadow">Visitors see this — upload a location photo to override</p>
                  {onClipboardPaste && (
                    <p className="text-white/60 text-xs mt-2 drop-shadow opacity-0 group-hover/brand:opacity-100 transition-opacity">
                      Click to paste clipboard image as hero
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <ImageOff className="w-10 h-10 mb-2" />
                <p className="text-sm">No hero image selected</p>
                <p className="text-xs mt-1">
                  {onClipboardPaste ? 'Click to paste clipboard image, drag a file here, or click Upload Hero above' : 'Drag a screenshot here, click Upload Hero, or select from candidates below'}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══ EQUIPMENT (injected slot) ═══ */}
      {equipmentSlot}

      {/* ═══ GALLERY SECTION ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ImageIcon className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Gallery ({galleryPhotos.length} of 8)
          </h3>
        </div>
        {galleryPhotos.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {galleryPhotos.map(photo => (
              <div key={photo.id} className="relative group flex-shrink-0 w-36 rounded-lg overflow-hidden border-2 border-blue-400">
                <div className="aspect-[4/3] relative bg-gray-100">
                  <img
                    src={photo.url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const parent = e.currentTarget.parentElement;
                      if (parent && !parent.querySelector('.broken-placeholder')) {
                        const el = document.createElement('div');
                        el.className = 'broken-placeholder absolute inset-0 flex items-center justify-center bg-gray-200 text-gray-400 text-xs';
                        el.textContent = '⚠ Broken';
                        parent.appendChild(el);
                      }
                    }}
                  />
                </div>
                <div className="absolute top-1 left-1">{renderBadge(photo)}</div>
                {/* Remove from gallery */}
                <button
                  onClick={() => onRemoveFromGallery(photo.id)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove from gallery"
                >
                  <X className="w-3 h-3" />
                </button>
                {/* Tools */}
                <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); onSetAsHero(photo.id); }}
                    className="w-6 h-6 rounded-full bg-black/50 hover:bg-amber-500 text-white flex items-center justify-center"
                    title="Set as hero (current hero moves to gallery)"
                  >
                    <Star className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onCrop(photo); }}
                    className="w-6 h-6 rounded-full bg-black/50 hover:bg-blue-600 text-white flex items-center justify-center"
                    title="Crop"
                  >
                    <Crop className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEnhance(photo); }}
                    className="w-6 h-6 rounded-full bg-black/50 hover:bg-purple-600 text-white flex items-center justify-center"
                    title="Enhance"
                  >
                    <Wand2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 py-4 text-center text-gray-400 text-sm">
            Shift+click a photo below to add to gallery
          </div>
        )}
      </div>

      {/* ═══ CANDIDATES SECTION ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Plus className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Photo Candidates ({untaggedPhotos.length})
          </h3>
          {discovering && (
            <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full" />
          )}
          <span className="text-xs text-gray-400 ml-auto">Click = Preview | Star = Hero | Gallery = Gallery | X = Skip</span>
        </div>
        {untaggedPhotos.length > 0 ? (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-2">
            {untaggedPhotos.map((photo) => {
              const badge = SOURCE_BADGES[photo.source] ?? { label: photo.source, color: 'bg-gray-500' };
              return (
                <div
                  key={photo.id}
                  data-photo-card
                  className="relative group rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-gray-400 transition-all"
                  onClick={() => {
                    setExpandedId(photo.id);
                  }}
                >
                  <div className="aspect-[4/3] relative bg-gray-100">
                    <img
                      src={photo.url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        // Auto-hide low-res images (under 400x300)
                        if (img.naturalWidth < 400 || img.naturalHeight < 300) {
                          const card = img.closest('[data-photo-card]') as HTMLElement;
                          if (card) card.style.display = 'none';
                        }
                      }}
                      onError={(e) => {
                        // Hide the entire card when image fails to load
                        const card = e.currentTarget.closest('[data-photo-card]') as HTMLElement;
                        if (card) card.style.display = 'none';
                      }}
                    />
                  </div>
                  {/* Source badge (clickable if sourceUrl exists) */}
                  <div className="absolute top-1 left-1">
                    {photo.sourceUrl ? (
                      <a
                        href={photo.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${badge.color} hover:opacity-80 cursor-pointer underline decoration-white/50`}
                        title={`View source: ${photo.sourceUrl}`}
                      >
                        {badge.label}
                      </a>
                    ) : (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${badge.color}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  {/* Action buttons on hover */}
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSkipPhoto(photo.id); }}
                      className="w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-600 text-white flex items-center justify-center"
                      title="Skip this photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {/* Quick action buttons on hover */}
                  <div className="absolute bottom-1 left-1 right-1 flex gap-1 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSetAsHero(photo.id); }}
                      className="px-2 py-0.5 rounded bg-amber-500/90 hover:bg-amber-600 text-white text-[10px] font-bold"
                      title="Set as hero"
                    >
                      Hero
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAddToGallery(photo.id); }}
                      className="px-2 py-0.5 rounded bg-blue-500/90 hover:bg-blue-600 text-white text-[10px] font-bold"
                      title="Add to gallery"
                    >
                      Gallery
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedId(photo.id); }}
                      className="px-2 py-0.5 rounded bg-white/80 hover:bg-white text-gray-700 text-[10px] font-bold"
                      title="Enlarge"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                  </div>
                  {/* Label */}
                  {photo.label && (
                    <div className="absolute bottom-8 left-0 right-0 text-center pointer-events-none">
                      <span className="text-[9px] text-white bg-black/40 px-1 rounded">
                        {photo.label.length > 20 ? photo.label.slice(0, 20) + '...' : photo.label}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : !discovering ? (
          <div className="text-center py-4 text-gray-400 text-sm">
            No untagged photos. Use Street View below or paste a URL.
          </div>
        ) : null}
      </div>

      {/* ═══ SKIPPED (collapsed) ═══ */}
      {skippedPhotos.length > 0 && (
        <details className="text-xs text-gray-400">
          <summary className="cursor-pointer hover:text-gray-600">
            {skippedPhotos.length} skipped photo{skippedPhotos.length !== 1 ? 's' : ''}
          </summary>
          <div className="flex gap-1 mt-2 flex-wrap">
            {skippedPhotos.map(photo => (
              <div
                key={photo.id}
                className="w-16 h-12 rounded overflow-hidden opacity-40 cursor-pointer hover:opacity-70"
                onClick={() => onTag(photo.id, null)}
                title="Click to restore"
              >
                <img src={photo.url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ═══ LIGHTBOX ═══ */}
      {expandedId && (() => {
        const photo = candidates.find(c => c.id === expandedId);
        if (!photo) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setExpandedId(null)}
          >
            <div className="relative max-w-4xl max-h-[80vh]" onClick={e => e.stopPropagation()}>
              <img src={photo.url} alt="" className="max-w-full max-h-[80vh] object-contain rounded-lg" referrerPolicy="no-referrer" />
              {/* Top toolbar */}
              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  onClick={() => { setExpandedId(null); onCrop(photo); }}
                  className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-blue-600"
                  title="Crop"
                >
                  <Crop className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setExpandedId(null); onEnhance(photo); }}
                  className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-purple-600"
                  title="Enhance"
                >
                  <Wand2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setExpandedId(null)}
                  className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* Bottom action buttons */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                <button
                  onClick={() => { onSetAsHero(photo.id); setExpandedId(null); }}
                  className={`px-4 py-2 rounded-full text-white text-sm font-medium ${
                    photo.tag === 'hero' ? 'bg-amber-500' : 'bg-white/20 hover:bg-amber-500'
                  }`}
                >
                  Set as Hero
                </button>
                <button
                  onClick={() => { onAddToGallery(photo.id); setExpandedId(null); }}
                  className={`px-4 py-2 rounded-full text-white text-sm font-medium ${
                    photo.tag === 'gallery' ? 'bg-blue-500' : 'bg-white/20 hover:bg-blue-500'
                  }`}
                >
                  Add to Gallery
                </button>
                <button
                  onClick={() => { onSkipPhoto(photo.id); setExpandedId(null); }}
                  className="px-4 py-2 rounded-full text-white text-sm font-medium bg-white/20 hover:bg-red-500"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
