'use client';

import { useRef, useEffect, useState } from 'react';
import { X, Flag, ImageOff, ZoomIn, Crop, ExternalLink, CarFront, Star, Trash2, ChevronDown, ImageIcon, Upload } from 'lucide-react';
import { HeroListing, ReplacementOption } from './types';
import HeroImageFallback from '@/components/HeroImageFallback';
import { CropModal } from './CropModal';

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

interface GalleryItem {
  kind: 'photo' | 'placeholder';
  url?: string;
  label: string;
  source?: string;
  onUseAsHero: () => void;
  onDelete?: () => void;
}

interface LightboxProps {
  url: string;
  label: string;
  onClose: () => void;
  onUseAsHero: () => void;
  onDelete?: () => void;
}

function PhotoLightbox({ url, label, onClose, onUseAsHero, onDelete }: LightboxProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') { onUseAsHero(); onClose(); }
      if (e.key === 'Delete' && onDelete) { onDelete(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onUseAsHero, onDelete]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={url}
          alt={label}
          className="max-w-[88vw] max-h-[75vh] object-contain rounded-lg shadow-2xl"
        />
        <div className="flex items-center gap-2">
          <span className="text-white/50 text-xs">{label}</span>
          <div className="w-px h-4 bg-white/20" />
          <button
            onClick={() => { onUseAsHero(); onClose(); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors shadow-lg"
            title="Use as hero (Enter)"
          >
            <Star className="w-3.5 h-3.5" />
            Use as hero
          </button>
          {onDelete && (
            <button
              onClick={() => { onDelete(); onClose(); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors shadow-lg"
              title="Delete photo (Del)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
            title="Close (Esc)"
          >
            <X className="w-3.5 h-3.5" />
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function PlaceholderThumb({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center bg-gray-100 gap-1 ${className ?? ''}`}>
      <ImageIcon className="w-5 h-5 text-gray-300" />
      <span className="text-[9px] text-gray-400 font-medium">Placeholder</span>
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
  onDeleteHero: () => void;
  onDeleteExternalPhoto: (field: 'google_photo_url' | 'street_view_url') => void;
  onRemoveGalleryPhoto: (url: string) => void;
  onCropSave: (url: string) => void;
  onUploadHero: (file: File) => void;
  onMarkNotTouchless: () => void;
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
  onDeleteHero,
  onDeleteExternalPhoto,
  onRemoveGalleryPhoto,
  onCropSave,
  onUploadHero,
  onMarkNotTouchless,
  onFlag,
  onFocus,
  confirmIndex,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<{ url: string; label: string; onUseAsHero: () => void; onDelete?: () => void } | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isFocused]);

  const hasHero = !!listing.hero_image;
  const replacementUrls = new Set(replacements.map(r => r.url));
  const galleryPhotos = (listing.photos ?? []).filter(
    p => p !== listing.hero_image && !replacementUrls.has(p)
  );

  const externalFieldFor = (url: string): 'google_photo_url' | 'street_view_url' | null => {
    if (url === listing.google_photo_url) return 'google_photo_url';
    if (url === listing.street_view_url) return 'street_view_url';
    return null;
  };

  const galleryItems: GalleryItem[] = [
    ...replacements.map((opt) => {
      const field = externalFieldFor(opt.url);
      return {
        kind: 'photo' as const,
        url: opt.url,
        label: opt.label,
        source: opt.source,
        onUseAsHero: () => {
          const idx = replacements.findIndex(r => r.url === opt.url);
          onReplace(opt.url, opt.source);
          void idx;
        },
        onDelete: field ? () => onDeleteExternalPhoto(field) : undefined,
      };
    }),
    ...galleryPhotos.map((url) => ({
      kind: 'photo' as const,
      url,
      label: 'Gallery',
      source: 'gallery',
      onUseAsHero: () => onReplace(url, 'gallery'),
      onDelete: () => onRemoveGalleryPhoto(url),
    })),
    {
      kind: 'placeholder' as const,
      label: 'Placeholder',
      onUseAsHero: () => onReplace(null, 'placeholder'),
    },
  ];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onUploadHero(file);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <>
    <input
      ref={uploadInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="hidden"
      onChange={handleFileChange}
    />
    {lightbox && (
      <PhotoLightbox
        url={lightbox.url}
        label={lightbox.label}
        onClose={() => setLightbox(null)}
        onUseAsHero={() => { lightbox.onUseAsHero(); setLightbox(null); }}
        onDelete={lightbox.onDelete}
      />
    )}
    {cropOpen && listing.hero_image && (
      <CropModal
        imageUrl={listing.hero_image}
        listingId={listing.id}
        onSave={(url) => { onCropSave(url); setCropOpen(false); }}
        onClose={() => setCropOpen(false)}
      />
    )}
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
              onClick={(e) => {
                e.stopPropagation();
                setLightbox({
                  url: listing.hero_image!,
                  label: `Hero — ${listing.hero_image_source ?? 'unknown'}`,
                  onUseAsHero: () => {},
                  onDelete: onDeleteHero,
                });
              }}
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
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setCropOpen(true); }}
                className="w-7 h-7 rounded-full bg-gray-700/80 hover:bg-blue-600 text-white flex items-center justify-center shadow-md transition-colors"
                title="Crop hero image"
              >
                <Crop className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveHero(); }}
                className="w-7 h-7 rounded-full bg-gray-700/80 hover:bg-gray-900 text-white flex items-center justify-center shadow-md transition-colors"
                title="Clear hero (keeps photo in gallery)"
              >
                <ImageOff className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); isExpanded ? onCollapse() : onExpand(); }}
            className="w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md transition-colors"
            title="Open photo gallery (X)"
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
        <div className="flex items-center gap-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate leading-tight flex-1">{listing.name}</p>
          {listing.website && (
            <a
              href={listing.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex-shrink-0 text-gray-400 hover:text-blue-500 transition-colors"
              title="Open website"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
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
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-orange-800">
              Available photos
              <span className="font-normal text-orange-500 ml-1">— zoom, set as hero, or delete</span>
            </p>
            <button onClick={onCollapse} className="text-gray-400 hover:text-gray-600">
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {galleryItems.length === 1 ? (
            <p className="text-xs text-gray-400 mb-2">No photos available — only placeholder</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {galleryItems.map((item, idx) => {
              const isConfirmed = confirmIndex !== null && item.kind === 'photo' &&
                replacements[confirmIndex]?.url === item.url;

              return (
                <div key={item.url ?? 'placeholder'} className="flex flex-col gap-1">
                  <div className="relative group/item w-20 h-14">
                    {item.kind === 'placeholder' ? (
                      <PlaceholderThumb className="w-20 h-14 rounded-md" />
                    ) : (
                      <img
                        src={item.url}
                        alt={item.label}
                        loading="lazy"
                        className="w-20 h-14 object-cover rounded-md border border-gray-200"
                        onError={(e) => {
                          const p = (e.target as HTMLImageElement).closest('.flex.flex-col') as HTMLElement | null;
                          if (p) p.style.display = 'none';
                        }}
                      />
                    )}

                    {isConfirmed && (
                      <div className="absolute inset-0 rounded-md bg-emerald-500/80 flex items-center justify-center">
                        <Star className="w-5 h-5 text-white fill-white" />
                      </div>
                    )}

                    {item.kind === 'photo' && !isConfirmed && (
                      <button
                        onClick={() => setLightbox({
                          url: item.url!,
                          label: item.label,
                          onUseAsHero: item.onUseAsHero,
                          onDelete: item.onDelete,
                        })}
                        className="absolute inset-0 flex items-center justify-center rounded-md bg-black/0 group-hover/item:bg-black/25 transition-colors opacity-0 group-hover/item:opacity-100"
                        title="View full size"
                      >
                        <ZoomIn className="w-5 h-5 text-white drop-shadow-lg" />
                      </button>
                    )}
                  </div>

                  <div className="flex gap-1 w-20">
                    <button
                      onClick={item.onUseAsHero}
                      className="flex-1 h-5 rounded flex items-center justify-center bg-emerald-100 hover:bg-emerald-500 text-emerald-600 hover:text-white transition-colors text-[9px] font-semibold gap-0.5"
                      title={`Use as hero${item.kind === 'placeholder' ? ' (placeholder)' : ''}`}
                    >
                      <Star className="w-2.5 h-2.5" />
                    </button>
                    {item.onDelete && (
                      <button
                        onClick={item.onDelete}
                        className="flex-1 h-5 rounded flex items-center justify-center bg-red-100 hover:bg-red-500 text-red-500 hover:text-white transition-colors"
                        title="Delete this photo"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>

                  <div className="text-[9px] text-center text-gray-400 leading-none truncate w-20">
                    {item.label}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 pt-2.5 border-t border-orange-200 flex items-center gap-2 flex-wrap">
            <button
              onClick={(e) => { e.stopPropagation(); uploadInputRef.current?.click(); }}
              disabled={uploading}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Upload a photo as hero"
            >
              <Upload className="w-3 h-3" />
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <button
              onClick={onFlag}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
                listing.flagged
                  ? 'bg-amber-200 text-amber-800'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'
              }`}
            >
              <Flag className="w-3 h-3" />
              {listing.flagged ? 'Flagged' : 'Flag'}
            </button>
            <button
              onClick={onMarkNotTouchless}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors"
              title="Mark as NOT touchless"
            >
              <CarFront className="w-3 h-3" />
              Not touchless
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
