'use client';

import { useState, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Crop as CropIcon, RotateCw, Check, Trash2, ChevronLeft, ChevronRight, Wand2 } from 'lucide-react';

interface Props {
  imageUrl: string;
  listingId: string;
  uploadType?: 'hero' | 'gallery';
  onSave: (croppedUrl: string) => void;
  onClose: () => void;
  onDelete?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onEnhance?: () => void;
  zIndex?: number;
}

const ASPECT_OPTIONS = [
  { label: '16:9', value: 16 / 9 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: 'Free', value: undefined },
];

function centerAspectCrop(width: number, height: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 100 }, aspect, width, height),
    width,
    height,
  );
}

async function getCroppedBlob(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  // Use Math.round to avoid sub-pixel sizing issues
  const srcX = Math.round(pixelCrop.x * scaleX);
  const srcY = Math.round(pixelCrop.y * scaleY);
  const srcW = Math.round(pixelCrop.width * scaleX);
  const srcH = Math.round(pixelCrop.height * scaleY);

  // Output at full source resolution
  canvas.width = srcW;
  canvas.height = srcH;

  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    image,
    srcX, srcY, srcW, srcH,
    0, 0, srcW, srcH,
  );

  // JPEG at q=0.92 — hero sources are already JPEG (Google Place photos,
  // user uploads), so PNG-for-lossless was actually harmful: it ballooned
  // a 4080×3072 crop from ~1MB to ~12MB and tripped Netlify Functions'
  // 6MB body limit, returning the generic "Internal Error" the user saw.
  // q=0.92 is visually indistinguishable from PNG for photographic content.
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => { if (blob) resolve(blob); else reject(new Error('Canvas is empty')); },
      'image/jpeg',
      0.92,
    );
  });
}

// Proxy external URLs through our server to bypass CORS restrictions
function getProxiedUrl(url: string): string {
  if (!url) return url;
  // Supabase storage URLs have CORS headers — no proxy needed
  if (url.includes('supabase.co/')) return url;
  // Data URLs don't need proxying
  if (url.startsWith('data:')) return url;
  // Blob URLs don't need proxying
  if (url.startsWith('blob:')) return url;
  // Everything else: proxy through our API
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

export function CropModal({ imageUrl, listingId, uploadType = 'hero', onSave, onClose, onDelete, onNext, onPrev, onEnhance, zIndex }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  // Gallery images default to "Free" aspect (show entire image), hero defaults to 16:9
  const [aspect, setAspect] = useState<number | undefined>(uploadType === 'gallery' ? undefined : 16 / 9);
  const [saving, setSaving] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cache-bust per open. The crop <img> loads with crossOrigin="anonymous", which the browser
  // caches in a SEPARATE partition from the no-cors <img> used for the hero/gallery thumbnails.
  // That partition can serve a stale decode (the previously-cropped image) even though the URL is
  // correct — the "I see the last image I cropped" bug. A fresh token per mount forces a clean load.
  const cacheBust = useRef(Date.now()).current;
  const base = getProxiedUrl(imageUrl);
  const proxiedImageUrl = base + (base.includes('?') ? '&' : '?') + '_cb=' + cacheBust;

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    if (aspect) {
      setCrop(centerAspectCrop(width, height, aspect));
    } else {
      setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
    }
  }, [aspect]);

  const handleAspectChange = (newAspect: number | undefined) => {
    setAspect(newAspect);
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      if (newAspect) {
        setCrop(centerAspectCrop(width, height, newAspect));
      } else {
        setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
      }
    }
  };

  const handleSave = async () => {
    if (!completedCrop || !imgRef.current) return;
    setSaving(true);
    setError(null);

    try {
      const blob = await getCroppedBlob(imgRef.current, completedCrop);
      const formData = new FormData();
      formData.append('file', blob, 'cropped-hero.jpg');
      formData.append('listingId', listingId);
      formData.append('type', uploadType);

      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      onSave(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 ${zIndex ? '' : 'z-50'}`}
      style={zIndex ? { zIndex } : undefined}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <CropIcon className="w-4 h-4 text-orange-600" />
            <h2 className="text-sm font-semibold text-gray-800">
              {uploadType === 'gallery' ? 'Edit Gallery Image' : 'Crop Hero Image'}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {onEnhance && (
              <button
                onClick={async () => { setEnhancing(true); await onEnhance(); setEnhancing(false); }}
                disabled={enhancing}
                className="w-8 h-8 rounded-full bg-purple-100 hover:bg-purple-200 flex items-center justify-center transition-colors"
                title="Enhance colors"
              >
                {enhancing ? <RotateCw className="w-4 h-4 text-purple-600 animate-spin" /> : <Wand2 className="w-4 h-4 text-purple-600" />}
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="w-8 h-8 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition-colors"
                title="Delete this image"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            )}
            {onPrev && (
              <button
                onClick={onPrev}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                title="Previous image"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
            )}
            {onNext && (
              <button
                onClick={onNext}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                title="Next image"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-500 font-medium mr-1">Aspect ratio:</span>
          {ASPECT_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => handleAspectChange(opt.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                aspect === opt.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto bg-gray-900 flex items-center justify-center p-4 min-h-[300px] max-h-[60vh]">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={aspect}
            minWidth={50}
            minHeight={50}
          >
            <img
              key={proxiedImageUrl}
              ref={imgRef}
              src={proxiedImageUrl}
              alt="Crop preview"
              onLoad={onImageLoad}
              onError={() => setError('Image failed to load. The source may be unavailable or blocked.')}
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[55vh] object-contain"
            />
          </ReactCrop>
        </div>

        {error && (
          <div className="px-5 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200">
          <p className="text-xs text-gray-400">
            {completedCrop
              ? `${Math.round(completedCrop.width * (imgRef.current ? imgRef.current.naturalWidth / imgRef.current.width : 1))} x ${Math.round(completedCrop.height * (imgRef.current ? imgRef.current.naturalHeight / imgRef.current.height : 1))} px`
              : 'Drag to adjust crop area'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!completedCrop || saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Save crop
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
