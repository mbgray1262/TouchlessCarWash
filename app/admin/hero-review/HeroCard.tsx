'use client';

import { useRef, useEffect, useState } from 'react';
import { X, Flag, CheckCircle, ChevronDown, Trash2, ImageOff, ZoomIn } from 'lucide-react';
import { HeroListing, ReplacementOption } from './types';
import HeroImageFallback from '@/components/HeroImageFallback';

const SOURCE_COLORS: Record<string, string> = {
  gallery: 'bg-emerald-100 text-emerald-700',
  google: 'bg-blue-100 text-blue-700',
  street_view: 'bg-amber-100 text-amber-700',
  website: 'bg-sky-100 text-sky-700',
};

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">none</span>;
  const cls = SOURCE_COLORS[source] ?? 'bg-gray-100 text-gray-600';
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>{source.replace('_', ' ')}</span>;
}

function PhotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={url}
        alt="Full size preview"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function PlaceholderSVG({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-gray-100 ${className ?? ''}`}>
      <svg viewBox="0 0 80 60" className="w-16 h-12 text-gray-300" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="60" rx="6" fill="currentColor" opacity="0.4" />
        <circle cx="28" cy="22" r="7" fill="white" opacity="0.7" />
        <path d="M8 50 L24 32 L36 44 L52 28 L72 50 Z" fill="white" opacity="0.6" />
      </svg>
    </div>
  );
}

interface Props {
  listing: HeroListing;
  replacements: ReplacementOption[];
  isFocused: boolean;
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onReplace: (url: string | null, source: string) => void;
  onRemoveHero: () => void;
  onRemoveGalleryPhoto: (url: string) => void;
  onFlag: () => void;
  onFocus: () => void;
  confirmIndex: number | null;
}

export function HeroCard({
  listing,
  replacements,
  isFocused,
  isExpanded,
  onExpand,
  onCollapse,
  onReplace,
  onRemoveHero,
  onRemoveGalleryPhoto,
  onFlag,
  onFocus,
  confirmIndex,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isFocused]);

  const hasHero = !!listing.hero_image;
  const galleryPhotos = listing.photos ?? [];

  return (
    <>
    {lightboxUrl && <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    <div
      ref={cardRef}
      onClick={onFocus}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          isExpanded ? onCollapse() : onExpand();
        }
        if (e.key === 'Escape') onCollapse();
        if (isExpanded && e.key >= '1' && e.key <= '5') {
          const idx = parseInt(e.key, 10) - 1;
          if (replacements[idx]) onReplace(replacements[idx].url, replacements[idx].source);
        }
      }}
      className={`
        relative rounded-xl overflow-hidden border-2 transition-all duration-200 outline-none cursor-pointer
        ${isFocused ? 'border-orange-400 shadow-lg shadow-orange-100' : 'border-gray-200 hover:border-gray-300'}
        ${!hasHero ? 'opacity-60' : ''}
        ${listing.flagged ? 'ring-2 ring-amber-400 ring-offset-1' : ''}
      `}
    >
      <div className="relative bg-gray-100 h-48 overflow-hidden group/hero">
        {listing.hero_image ? (
          <>
            <img
              src={listing.hero_image}
              alt={listing.name}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxUrl(listing.hero_image!); }}
              className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/hero:bg-black/30 transition-colors"
              title="View full size"
            >
              <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover/hero:opacity-100 transition-opacity drop-shadow-lg" />
            </button>
          </>
        ) : (
          <HeroImageFallback variant="card" className="w-full h-full" />
        )}

        <div className="absolute top-2 right-2 flex gap-1 z-10">
          {hasHero && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemoveHero(); }}
              className="w-7 h-7 rounded-full bg-gray-700/80 hover:bg-gray-900 text-white flex items-center justify-center shadow-md transition-colors"
              title="Remove hero (set to placeholder)"
            >
              <ImageOff className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); isExpanded ? onCollapse() : onExpand(); }}
            className="w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md transition-colors"
            title="Reject & replace"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {listing.flagged && (
          <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center shadow">
            <Flag className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      <div className="p-2.5 bg-white">
        <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{listing.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">{listing.city}, {listing.state}</p>
        <div className="mt-1.5">
          <SourceBadge source={listing.hero_image_source} />
        </div>
      </div>

      {isExpanded && (
        <div
          className="border-t-2 border-orange-300 bg-orange-50 p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-orange-800">Choose replacement</p>
            <button onClick={onCollapse} className="text-gray-400 hover:text-gray-600">
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {replacements.length === 0 && galleryPhotos.length === 0 ? (
            <p className="text-xs text-gray-500 mb-2">No alternatives available</p>
          ) : (
            <div className="flex gap-1.5 flex-wrap mb-2">
              {replacements.map((opt, idx) => (
                <div key={opt.url} className="relative">
                  <button
                    onClick={() => onReplace(opt.url, opt.source)}
                    className="relative group block rounded-md overflow-hidden border-2 border-transparent hover:border-orange-400 transition-all"
                    title={`${idx + 1}: ${opt.label}`}
                  >
                    <img
                      src={opt.url}
                      alt={opt.label}
                      loading="lazy"
                      className="w-16 h-12 object-cover"
                      onError={(e) => {
                        const p = (e.target as HTMLImageElement).parentElement?.parentElement;
                        if (p) p.style.display = 'none';
                      }}
                    />
                    {confirmIndex === idx && (
                      <div className="absolute inset-0 bg-emerald-500/80 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center py-0.5 leading-none">
                      {idx + 1} {opt.label}
                    </div>
                  </button>
                </div>
              ))}

              <button
                onClick={() => onReplace(null, 'placeholder')}
                className="relative group block rounded-md overflow-hidden border-2 border-transparent hover:border-orange-400 transition-all"
                title="Use Placeholder"
              >
                <PlaceholderSVG className="w-16 h-12" />
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center py-0.5 leading-none">
                  Placeholder
                </div>
              </button>
            </div>
          )}

          {galleryPhotos.length > 0 && (
            <div className="mt-2 pt-2 border-t border-orange-200">
              <p className="text-[10px] font-semibold text-orange-700 mb-1.5">Gallery photos</p>
              <div className="flex gap-1.5 flex-wrap">
                {galleryPhotos.map((url) => (
                  <div key={url} className="relative group/gal">
                    <img
                      src={url}
                      alt="gallery"
                      loading="lazy"
                      className="w-14 h-10 object-cover rounded border border-gray-200 cursor-zoom-in"
                      onClick={(e) => { e.stopPropagation(); setLightboxUrl(url); }}
                      onError={(e) => {
                        const p = (e.target as HTMLImageElement).parentElement;
                        if (p) p.style.display = 'none';
                      }}
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveGalleryPhoto(url); }}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow transition-colors"
                      title="Delete from gallery"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={onFlag}
            className={`mt-2 flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
              listing.flagged
                ? 'bg-amber-200 text-amber-800'
                : 'bg-white border border-gray-300 text-gray-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'
            }`}
          >
            <Flag className="w-3 h-3" />
            {listing.flagged ? 'Flagged' : 'Flag for later'}
          </button>
        </div>
      )}
    </div>
    </>
  );
}
