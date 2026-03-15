'use client';

import { useRef, useEffect, useState } from 'react';
import { X, Flag, ImageOff, ZoomIn, Crop, ExternalLink, CarFront, Star, Trash2, ChevronDown, ChevronLeft, ChevronRight, ImageIcon, Upload, Wand2 } from 'lucide-react';
import { HeroListing, ReplacementOption, EQUIPMENT_BRANDS } from './types';
import HeroImageFallback from '@/components/HeroImageFallback';
import { CropModal } from './CropModal';
import { getStateSlug, slugify } from '@/lib/constants';

/** Strip Google photo resolution params so we can compare base URLs. */
function normalizePhotoUrl(url: string): string {
  return url.replace(/=[whs]\d+(?:-[a-z0-9]+)*$/, '');
}

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
  onEnhance?: () => Promise<void>;
  onDelete?: () => void;
}

interface LightboxProps {
  url: string;
  label: string;
  onClose: () => void;
  onUseAsHero: () => void;
  onEnhance?: (imageUrl: string) => Promise<void>;
  enhanceLabel?: string; // Override the button text (e.g. "Revert" for toggle-off)
  onDelete?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  position?: string; // e.g. "3 / 8"
}

function PhotoLightbox({ url, label, onClose, onUseAsHero, onEnhance, enhanceLabel, onDelete, onPrev, onNext, position }: LightboxProps) {
  const [lbEnhancing, setLbEnhancing] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') { onUseAsHero(); onClose(); }
      if (e.key === 'Delete' && onDelete) { onDelete(); onClose(); }
      if (e.key === 'ArrowLeft' && onPrev) { e.preventDefault(); onPrev(); }
      if (e.key === 'ArrowRight' && onNext) { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onUseAsHero, onDelete, onPrev, onNext]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Prev arrow */}
      {onPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
          title="Previous (←)"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Next arrow */}
      {onNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
          title="Next (→)"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

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
          {position && (
            <>
              <div className="w-px h-4 bg-white/20" />
              <span className="text-white/40 text-xs">{position}</span>
            </>
          )}
          <div className="w-px h-4 bg-white/20" />
          <button
            onClick={() => { onUseAsHero(); onClose(); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors shadow-lg"
            title="Use as hero (Enter)"
          >
            <Star className="w-3.5 h-3.5" />
            Use as hero
          </button>
          {onEnhance && (
            <button
              onClick={async () => {
                if (lbEnhancing) return;
                setLbEnhancing(true);
                try { await onEnhance(url); onClose(); } catch {} finally { setLbEnhancing(false); }
              }}
              disabled={lbEnhancing}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors shadow-lg ${
                lbEnhancing ? 'bg-purple-500 animate-pulse' : 'bg-purple-500 hover:bg-purple-600'
              }`}
              title={enhanceLabel === 'Revert' ? 'Revert to original' : 'Auto-enhance & use as hero'}
            >
              <Wand2 className="w-3.5 h-3.5" />
              {lbEnhancing ? 'Processing…' : enhanceLabel ?? 'Enhance & use'}
            </button>
          )}
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
  onEnhance: (imageUrl: string) => Promise<void>;
  onEnhancePhoto: (imageUrl: string) => Promise<void>;
  onRevertEnhance: (originalUrl: string, originalSource: string | null) => Promise<void>;
  onUploadHero: (file: File) => void;
  onMarkNotTouchless: () => void;
  onSetEquipment: (brand: string | null, model: string | null) => void;
  getModelsForBrand: (brand: string) => string[];
  customBrands: { value: string; label: string }[];
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
  onEnhance,
  onEnhancePhoto,
  onRevertEnhance,
  onUploadHero,
  onMarkNotTouchless,
  onSetEquipment,
  getModelsForBrand,
  customBrands,
  onFlag,
  onFocus,
  confirmIndex,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null); // index into galleryItems (photos only)
  const [heroLightbox, setHeroLightbox] = useState(false); // separate state for hero preview
  const [cropOpen, setCropOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [modelDraft, setModelDraft] = useState(listing.equipment_model ?? '');
  const [brandDraft, setBrandDraft] = useState('');
  /** Stores the original (pre-enhance) hero URL + source so we can toggle back. */
  const [preEnhance, setPreEnhance] = useState<{ url: string; source: string | null } | null>(null);

  // Sync model draft when listing changes (skip sentinel values)
  useEffect(() => {
    const m = listing.equipment_model ?? '';
    if (m !== '__other__') setModelDraft(m);
  }, [listing.equipment_model]);

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isFocused]);

  const hasHero = !!listing.hero_image;
  // Use normalized URLs to catch same photo at different resolutions (w800 vs w1600)
  const replacementBases = new Set(replacements.map(r => normalizePhotoUrl(r.url)));
  const heroBase = listing.hero_image ? normalizePhotoUrl(listing.hero_image) : null;
  const galleryPhotos = (listing.photos ?? []).filter(p => {
    const base = normalizePhotoUrl(p);
    return base !== heroBase && !replacementBases.has(base);
  });

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
        onEnhance: () => onEnhancePhoto(opt.url),
        onDelete: field ? () => onDeleteExternalPhoto(field) : undefined,
      };
    }),
    ...galleryPhotos.map((url) => ({
      kind: 'photo' as const,
      url,
      label: 'Gallery',
      source: 'gallery',
      onUseAsHero: () => onReplace(url, 'gallery'),
      onEnhance: () => onEnhancePhoto(url),
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
    {heroLightbox && listing.hero_image && (
      <PhotoLightbox
        url={listing.hero_image}
        label={`Hero — ${listing.hero_image_source ?? 'unknown'}`}
        onClose={() => setHeroLightbox(false)}
        onUseAsHero={() => {}}
        onEnhance={preEnhance
          ? async () => {
              await onRevertEnhance(preEnhance.url, preEnhance.source);
              setPreEnhance(null);
            }
          : async (imageUrl) => {
              const originalUrl = listing.hero_image!;
              const originalSource = listing.hero_image_source ?? null;
              await onEnhance(imageUrl);
              setPreEnhance({ url: originalUrl, source: originalSource });
            }
        }
        enhanceLabel={preEnhance ? 'Revert' : undefined}
        onDelete={onDeleteHero}
      />
    )}
    {lightboxIndex !== null && (() => {
      const photoItems = galleryItems.filter(i => i.kind === 'photo');
      const item = photoItems[lightboxIndex];
      if (!item || !item.url) return null;
      return (
        <PhotoLightbox
          url={item.url}
          label={item.label}
          onClose={() => setLightboxIndex(null)}
          onUseAsHero={() => { item.onUseAsHero(); setLightboxIndex(null); }}
          onEnhance={async (imageUrl) => { await onEnhance(imageUrl); setLightboxIndex(null); }}
          onDelete={item.onDelete}
          onPrev={lightboxIndex > 0 ? () => setLightboxIndex(lightboxIndex - 1) : undefined}
          onNext={lightboxIndex < photoItems.length - 1 ? () => setLightboxIndex(lightboxIndex + 1) : undefined}
          position={`${lightboxIndex + 1} / ${photoItems.length}`}
        />
      );
    })()}
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
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
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
                setHeroLightbox(true);
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
                onClick={async (e) => {
                  e.stopPropagation();
                  if (enhancing || !listing.hero_image) return;
                  setEnhancing(true);
                  try {
                    if (preEnhance) {
                      // Toggle OFF — revert to original
                      await onRevertEnhance(preEnhance.url, preEnhance.source);
                      setPreEnhance(null);
                    } else {
                      // Toggle ON — enhance and remember original
                      const originalUrl = listing.hero_image;
                      const originalSource = listing.hero_image_source ?? null;
                      await onEnhance(listing.hero_image);
                      setPreEnhance({ url: originalUrl, source: originalSource });
                    }
                  } catch {} finally { setEnhancing(false); }
                }}
                disabled={enhancing}
                className={`w-7 h-7 rounded-full text-white flex items-center justify-center shadow-md transition-colors ${
                  enhancing ? 'bg-purple-500 animate-pulse'
                    : preEnhance ? 'bg-purple-500 hover:bg-purple-600'
                    : 'bg-gray-700/80 hover:bg-purple-600'
                }`}
                title={preEnhance ? 'Revert to original (enhanced ✓)' : 'Auto-enhance (brightness, contrast, color)'}
              >
                <Wand2 className="w-3.5 h-3.5" />
              </button>
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
          {listing.slug && (
            <a
              href={`/state/${getStateSlug(listing.state)}/${slugify(listing.city)}/${listing.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex-shrink-0 text-gray-400 hover:text-emerald-500 transition-colors"
              title="Open listing page"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
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
        {listing.address && (
          <p className="text-xs text-gray-400 mt-0.5 truncate" title={listing.address}>{listing.address}</p>
        )}
        <p className="text-xs text-gray-500 mt-0.5">
          {listing.city}, {listing.state}
          <span className="ml-1.5 text-gray-300 font-mono select-all cursor-pointer" title={`ID: ${listing.id}`} onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(listing.id); }}>#{listing.id.slice(0, 6)}</span>
        </p>
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <SourceBadge source={listing.hero_image_source} />
          {listing.equipment_brand && listing.equipment_brand !== '__other__' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium" title={listing.equipment_model && listing.equipment_model !== '__other__' ? `${listing.equipment_brand} — ${listing.equipment_model}` : listing.equipment_brand}>
              🔧 {EQUIPMENT_BRANDS.find(b => b.value === listing.equipment_brand)?.label ?? customBrands.find(b => b.value === listing.equipment_brand)?.label ?? listing.equipment_brand}
              {listing.equipment_model && listing.equipment_model !== '__other__' && (
                <span className="text-indigo-500 font-normal"> · {listing.equipment_model}</span>
              )}
            </span>
          )}
          {galleryPhotos.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 tabular-nums">
              {galleryPhotos.length} <ImageIcon className="w-2.5 h-2.5 inline -mt-px" />
            </span>
          )}
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
                        onClick={() => {
                          // Find this item's index among photo-only items
                          const photoItems = galleryItems.filter(i => i.kind === 'photo');
                          const photoIdx = photoItems.findIndex(i => i.url === item.url);
                          setLightboxIndex(photoIdx >= 0 ? photoIdx : 0);
                        }}
                        className="absolute inset-0 flex items-center justify-center rounded-md bg-black/0 group-hover/item:bg-black/25 transition-colors opacity-0 group-hover/item:opacity-100"
                        title="View full size (← → to navigate)"
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
                    {item.onEnhance && (
                      <button
                        onClick={item.onEnhance}
                        className="flex-1 h-5 rounded flex items-center justify-center bg-purple-100 hover:bg-purple-500 text-purple-500 hover:text-white transition-colors"
                        title="Auto-enhance this photo"
                      >
                        <Wand2 className="w-2.5 h-2.5" />
                      </button>
                    )}
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
            {(() => {
              const allBrands = [...EQUIPMENT_BRANDS.filter(b => b.value !== 'other'), ...customBrands, { value: 'other', label: 'Other' }];
              const currentBrand = listing.equipment_brand ?? '';
              const isKnownBrand = allBrands.some(b => b.value === currentBrand);
              const showBrandInput = currentBrand === '__other__' || (currentBrand && !isKnownBrand && !EQUIPMENT_BRANDS.some(b => b.value === currentBrand));
              const selectValue = isKnownBrand ? currentBrand : (currentBrand ? '__other__' : '');

              return (
                <>
                  <select
                    value={selectValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__other__') {
                        onSetEquipment('__other__', null);
                        setBrandDraft('');
                      } else {
                        onSetEquipment(val || null, val ? listing.equipment_model : null);
                        setBrandDraft('');
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className={`text-xs px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                      listing.equipment_brand && listing.equipment_brand !== '__other__'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                        : 'bg-white border-gray-300 text-gray-500'
                    }`}
                    title="Equipment manufacturer"
                  >
                    <option value="">🔧 Equipment…</option>
                    {allBrands.map(b => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                    <option value="__other__">Other…</option>
                  </select>
                  {showBrandInput && (
                    <input
                      type="text"
                      placeholder="Manufacturer name…"
                      value={brandDraft}
                      onChange={(e) => setBrandDraft(e.target.value)}
                      onBlur={() => {
                        const val = brandDraft.trim() || null;
                        if (val) {
                          // Use a slug-ified version as the brand value
                          const slug = val.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
                          onSetEquipment(slug, null);
                        } else {
                          onSetEquipment(null, null);
                        }
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs px-2 py-1 rounded-md border border-gray-300 text-gray-700 w-32 bg-white focus:border-indigo-400 focus:outline-none"
                      title="Type a custom manufacturer name"
                      autoFocus
                    />
                  )}
                </>
              );
            })()}
            {listing.equipment_brand && (() => {
              const models = getModelsForBrand(listing.equipment_brand);
              const currentModel = listing.equipment_model ?? '';
              const isKnownModel = models.includes(currentModel);
              const showCustomInput = currentModel === '__other__' || (currentModel && !isKnownModel);
              const selectValue = isKnownModel ? currentModel : (currentModel ? '__other__' : '');

              return (
                <>
                  {models.length > 0 && (
                    <select
                      value={selectValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__other__') {
                          // Set a sentinel so the text input appears; don't save yet
                          onSetEquipment(listing.equipment_brand, '__other__');
                        } else {
                          onSetEquipment(listing.equipment_brand, val || null);
                          setModelDraft('');
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                        listing.equipment_model && listing.equipment_model !== '__other__'
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'bg-white border-gray-300 text-gray-500'
                      }`}
                      title="Equipment model"
                    >
                      <option value="">Model…</option>
                      {models.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                      <option value="__other__">Other…</option>
                    </select>
                  )}
                  {(showCustomInput || models.length === 0) && (
                    <input
                      type="text"
                      placeholder="Enter model…"
                      value={modelDraft}
                      onChange={(e) => setModelDraft(e.target.value)}
                      onBlur={() => {
                        const val = modelDraft.trim() || null;
                        if (val !== listing.equipment_model) {
                          onSetEquipment(listing.equipment_brand, val);
                        }
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation(); // Prevent card-level shortcuts (e.g. 'x' to close)
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs px-2 py-1 rounded-md border border-gray-300 text-gray-700 w-28 bg-white focus:border-indigo-400 focus:outline-none"
                      title="Type a custom model name"
                    />
                  )}
                </>
              );
            })()}
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
