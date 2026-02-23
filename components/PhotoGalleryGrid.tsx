'use client';

import { useState } from 'react';
import PhotoLightbox from './PhotoLightbox';

interface PhotoGalleryGridProps {
  photos: string[];
  listingName: string;
}

export default function PhotoGalleryGrid({ photos, listingName }: PhotoGalleryGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {photos.map((photo, i) => (
          <button
            key={i}
            onClick={() => setLightboxIndex(i)}
            className="aspect-video rounded-xl overflow-hidden bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:ring-offset-2"
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
