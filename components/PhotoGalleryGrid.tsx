'use client';

import { useState } from 'react';
import PhotoLightbox from './PhotoLightbox';

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

  return (
    <>
      <div className={`${gridClass} gap-3`}>
        {photos.map((photo, i) => (
          <button
            key={i}
            onClick={() => setLightboxIndex(i)}
            className={`${aspectClass} rounded-xl overflow-hidden bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:ring-offset-2`}
            aria-label={`View photo ${i + 1}`}
          >
            <img
              src={photo}
              alt={`${listingName} photo ${i + 1}`}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
              loading="lazy"
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
