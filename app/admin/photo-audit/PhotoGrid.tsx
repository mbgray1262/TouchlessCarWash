'use client';

import { useState } from 'react';
import { Star, Image as ImageIcon, Cpu, X, Crop, Wand2, ZoomIn } from 'lucide-react';
import type { CandidatePhoto, PhotoTag } from './useFastCuration';

interface PhotoGridProps {
  candidates: CandidatePhoto[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onTag: (id: string, tag: PhotoTag) => void;
  onCrop: (photo: CandidatePhoto) => void;
  onEnhance: (photo: CandidatePhoto) => void;
  discovering: boolean;
}

const TAG_COLORS: Record<string, string> = {
  hero: 'ring-4 ring-amber-400 bg-amber-50',
  gallery: 'ring-4 ring-blue-400 bg-blue-50',
  equipment: 'ring-4 ring-green-400 bg-green-50',
  skip: 'ring-4 ring-red-400 opacity-40',
};

const TAG_LABELS: Record<string, { icon: typeof Star; label: string; color: string }> = {
  hero: { icon: Star, label: 'H', color: 'bg-amber-500 hover:bg-amber-600' },
  gallery: { icon: ImageIcon, label: 'G', color: 'bg-blue-500 hover:bg-blue-600' },
  equipment: { icon: Cpu, label: 'E', color: 'bg-green-500 hover:bg-green-600' },
  skip: { icon: X, label: 'S', color: 'bg-red-500 hover:bg-red-600' },
};

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  existing: { label: 'Existing', color: 'bg-gray-600' },
  google_places: { label: 'Google', color: 'bg-blue-600' },
  google_search: { label: 'Search', color: 'bg-purple-600' },
  website: { label: 'Website', color: 'bg-teal-600' },
  street_view: { label: 'Street View', color: 'bg-orange-600' },
  capture: { label: 'Captured', color: 'bg-orange-500' },
  upload: { label: 'Uploaded', color: 'bg-indigo-600' },
};

function TagButton({ tag, isActive, onClick }: { tag: string; isActive: boolean; onClick: () => void }) {
  const config = TAG_LABELS[tag];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold transition-all ${
        isActive ? config.color : 'bg-gray-400/60 hover:bg-gray-500/80'
      }`}
      title={`${tag.charAt(0).toUpperCase() + tag.slice(1)} (${config.label})`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

export function PhotoGrid({ candidates, selectedId, onSelect, onTag, onCrop, onEnhance, discovering }: PhotoGridProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (discovering && candidates.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <div className="animate-spin w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full mr-3" />
        Discovering photos from all sources...
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No photos found. Try Street View below or paste a URL.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-2">
        {candidates.map((photo) => {
          const badge = SOURCE_BADGES[photo.source] ?? { label: photo.source, color: 'bg-gray-500' };
          const tagStyle = photo.tag ? TAG_COLORS[photo.tag] : '';
          const isSelected = selectedId === photo.id;

          return (
            <div
              key={photo.id}
              className={`relative group rounded-lg overflow-hidden cursor-pointer transition-all ${tagStyle} ${
                isSelected ? 'ring-4 ring-violet-500 scale-105 z-10' : ''
              }`}
              onClick={() => {
                onSelect(photo.id);
                setExpandedId(photo.id);
              }}
            >
              {/* Photo */}
              <div className="aspect-[4/3] relative bg-gray-100">
                <img
                  src={photo.url}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Source badge */}
              <div className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${badge.color}`}>
                {badge.label}
              </div>

              {/* Tag buttons (always visible) */}
              <div className="absolute bottom-1 left-1 right-1 flex gap-1 justify-center">
                {(['hero', 'gallery', 'equipment', 'skip'] as const).map(tag => (
                  <TagButton
                    key={tag}
                    tag={tag}
                    isActive={photo.tag === tag}
                    onClick={() => onTag(photo.id, tag)}
                  />
                ))}
              </div>

              {/* Tools (on hover) */}
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === photo.id ? null : photo.id); }}
                  className="w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center"
                  title="Zoom"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onCrop(photo); }}
                  className="w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center"
                  title="Crop"
                >
                  <Crop className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onEnhance(photo); }}
                  className="w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center"
                  title="Enhance"
                >
                  <Wand2 className="w-3 h-3" />
                </button>
              </div>

              {/* Label */}
              {photo.label && (
                <div className="absolute bottom-8 left-0 right-0 text-center">
                  <span className="text-[9px] text-white bg-black/40 px-1 rounded">
                    {photo.label.length > 20 ? photo.label.slice(0, 20) + '...' : photo.label}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Expanded preview */}
      {expandedId && (() => {
        const photo = candidates.find(c => c.id === expandedId);
        if (!photo) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setExpandedId(null)}
          >
            <div className="relative max-w-4xl max-h-[80vh]" onClick={e => e.stopPropagation()}>
              <img src={photo.url} alt="" className="max-w-full max-h-[80vh] object-contain rounded-lg" />
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
              {/* Bottom tag buttons */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                {(['hero', 'gallery', 'equipment', 'skip'] as const).map(tag => (
                  <button
                    key={tag}
                    onClick={() => onTag(photo.id, tag)}
                    className={`px-3 py-1.5 rounded-full text-white text-sm font-medium ${
                      photo.tag === tag ? TAG_LABELS[tag].color : 'bg-white/20 hover:bg-white/30'
                    }`}
                  >
                    {tag.charAt(0).toUpperCase() + tag.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
