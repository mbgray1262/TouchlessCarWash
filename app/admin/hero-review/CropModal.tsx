'use client';

import { useState, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Crop as CropIcon, RotateCw, Check } from 'lucide-react';

interface Props {
  imageUrl: string;
  listingId: string;
  onSave: (croppedUrl: string) => void;
  onClose: () => void;
}

const ASPECT_OPTIONS = [
  { label: '16:9', value: 16 / 9 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: 'Free', value: undefined },
];

function centerAspectCrop(width: number, height: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height),
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

export function CropModal({ imageUrl, listingId, onSave, onClose }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(16 / 9);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    if (aspect) {
      setCrop(centerAspectCrop(width, height, aspect));
    } else {
      setCrop({ unit: '%', x: 5, y: 5, width: 90, height: 90 });
    }
  }, [aspect]);

  const handleAspectChange = (newAspect: number | undefined) => {
    setAspect(newAspect);
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      if (newAspect) {
        setCrop(centerAspectCrop(width, height, newAspect));
      } else {
        setCrop({ unit: '%', x: 5, y: 5, width: 90, height: 90 });
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
      formData.append('type', 'hero');

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <CropIcon className="w-4 h-4 text-orange-600" />
            <h2 className="text-sm font-semibold text-gray-800">Crop Hero Image</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
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
              ref={imgRef}
              src={imageUrl}
              alt="Crop preview"
              onLoad={onImageLoad}
              crossOrigin="anonymous"
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
