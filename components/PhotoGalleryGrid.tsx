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

  const gridClass =
    photos.length === 1
      ? 'grid grid-cols-1'
      : photos.length === 2
      ? 'grid grid-cols-2'
      : 'grid grid-cols-2 sm:grid-cols-3';

  const aspectClass =
    photos.length === 1
      ? 'aspect-video sm:aspect-[21/9]'
      : photos.length === 2
      ? 'aspect-video'
      : 'aspect-video';

  // Tell the browser how wide each image will render so it picks the right srcset size
  const imageSizes =
    photos.length === 1
      ? '100vw'
      : photos.length === 2
      ? '50vw'
      : '(max-width: 640px) 50vw, 33vw';

  return (
    <>
      <div className={`${gridClass} gap-3`}>
        {photos.map((photo, i) => (
          <button
            key={i}
            onClick={() => setLightboxIndex(i)}
            className={`${aspectClass} relative rounded-xl overflow-hidden bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:ring-offset-2`}
            aria-label={`View photo ${i + 1}`}
          >
            <Image
              src={photo}
              alt={`${listingName} photo ${i + 1}`}
              fill
              sizes={imageSizes}
              className="object-cover hover:scale-105 transition-transform duration-300"
              loading="lazy"
              unoptimized={!isOptimizedHost(photo)}
            />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          listingName={listingName}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </>
  );
}
