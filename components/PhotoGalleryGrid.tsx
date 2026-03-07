'use client';

import { useState } from 'react';
import Image from 'next/image';
import PhotoLightbox from './PhotoLightbox';

const OPTIMIZED_HOSTS = new Set([
  'gteqijdpqjmgxfnyuhvy.supabase.co',
  'res.cloudinary.com',
  'lh3.googleusercontent.com',
  'streetviewpixels-pa.googleapis.com',
  'places.googleapis.com',
  'maps.googleapis.com',
]);

function isOptimizedHost(url: string): boolean {
  try {
    return OPTIMIZED_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

interface PhotoGalleryGridProps {
  photos: string[];
  listingName: string;
}

export default function PhotoGalleryGrid({ photos, listingName }: PhotoGalleryGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [failedPhotos, setFailedPhotos] = useState<Set<number>>(new Set());

  const visiblePhotos = photos.filter((_, i) => !failedPhotos.has(i));
  // Map from visible index back to original index (for lightbox)
  const visibleToOriginal = photos
    .map((_, i) => i)
    .filter((i) => !failedPhotos.has(i));

  const gridClass =
    visiblePhotos.length === 1
      ? 'grid grid-cols-1'
      : visiblePhotos.length === 2
      ? 'grid grid-cols-2'
      : 'grid grid-cols-2 sm:grid-cols-3';

  const aspectClass =
    visiblePhotos.length === 1
      ? 'aspect-video sm:aspect-[21/9]'
      : visiblePhotos.length === 2
      ? 'aspect-video'
      : 'aspect-video';

  // Tell the browser how wide each image will render so it picks the right srcset size
  const imageSizes =
    visiblePhotos.length === 1
      ? '100vw'
      : visiblePhotos.length === 2
      ? '50vw'
      : '(max-width: 640px) 50vw, 33vw';

  if (visiblePhotos.length === 0) return null;

  return (
    <>
      <div className={`${gridClass} gap-3`}>
        {visiblePhotos.map((photo, vi) => (
          <button
            key={visibleToOriginal[vi]}
            onClick={() => setLightboxIndex(visibleToOriginal[vi])}
            className={`${aspectClass} relative rounded-xl overflow-hidden bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:ring-offset-2`}
            aria-label={`View photo ${vi + 1}`}
          >
            <Image
              src={photo}
              alt={`${listingName} photo ${vi + 1}`}
              fill
              sizes={imageSizes}
              className="object-cover hover:scale-105 transition-transform duration-300"
              loading="lazy"
              unoptimized={!isOptimizedHost(photo)}
              onError={() => {
                setFailedPhotos((prev) => new Set(prev).add(visibleToOriginal[vi]));
              }}
            />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={visiblePhotos}
          index={visibleToOriginal.indexOf(lightboxIndex)}
          listingName={listingName}
          onClose={() => setLightboxIndex(null)}
          onNavigate={(vi) => setLightboxIndex(visibleToOriginal[vi])}
        />
      )}
    </>
  );
}
