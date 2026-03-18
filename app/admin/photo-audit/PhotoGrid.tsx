'use client';

import { useState } from 'react';
import { Star, Image as ImageIcon, Cpu, X, Crop, Wand2, ZoomIn, ImageOff, Plus, Trash2 } from 'lucide-react';
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
}

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  existing: { label: 'Existing', color: 'bg-gray-600' },
  google_places: { label: 'Google', color: 'bg-blue-600' },
  google_search: { label: 'Search', color: 'bg-purple-600' },
  website: { label: 'Website', color: 'bg-teal-600' },
  street_view: { label: 'Street View', color: 'bg-orange-600' },
  capture: { label: 'Captured', color: 'bg-orange-500' },
  upload: { label: 'Uploaded', color: 'bg-indigo-600' },
};

export function PhotoGrid({
  candidates, selectedId, onSelect, onTag,
  onSetAsHero, onAddToGallery, onRemoveFromGallery, onRemoveHero, onSkipPhoto,
  onCrop, onEnhance, discovering,
}: PhotoGridProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        </div>
        {heroPhoto ? (
          <div className="relative group rounded-xl overflow-hidden bg-gray-100 border-2 border-amber-400">
            <div className="aspect-video relative">
              <img
                src={heroPhoto.url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                referrerPolicy="no-referrer"
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
                className="w-8 h-8 rounded-full bg-black/50 hover:bg-purple-600 text-white flex items-center justify-center transition-colors"
                title="Enhance"
              >
                <Wand2 className="w-4 h-4" />
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
          <div className="aspect-video rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-gray-400">
            <ImageOff className="w-10 h-10 mb-2" />
            <p className="text-sm">No hero image selected</p>
            <p className="text-xs mt-1">Click a photo below to set as hero</p>
          </div>
        )}
      </div>

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
                      onError={(e) => {
                        const img = e.currentTarget;
                        img.style.display = 'none';
                        img.parentElement!.innerHTML = '<div class="absolute inset-0 flex items-center justify-center text-gray-400 text-xs text-center p-2">Image blocked<br/>by source</div>';
                      }}
                    />
                  </div>
                  {/* Source badge */}
                  <div className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${badge.color}`}>
                    {badge.label}
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
