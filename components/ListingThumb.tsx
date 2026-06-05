'use client';

/**
 * A listing thumbnail that can NEVER render broken.
 *  - Source via getDisplayImage (chain-brand image → hero → google → street view),
 *    so a chain like Shell shows its brand image instead of a dead hero URL.
 *  - onError swaps to the generic card fallback if the chosen URL fails to load.
 * Used in the "nearby washes" lists where a server component can't attach onError.
 */

import { useState } from 'react';
import Image from 'next/image';
import { getDisplayImage, type ListingImageFields } from '@/lib/listing-image';
import HeroImageFallback from '@/components/HeroImageFallback';

function isOptimizedImageHost(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h.includes('supabase.co') || h.includes('googleusercontent.com');
  } catch {
    return false;
  }
}

export function ListingThumb({
  listing,
  alt,
  sizes = '64px',
  allowStreetView = false,
}: {
  listing: ListingImageFields & { name?: string };
  alt?: string;
  sizes?: string;
  allowStreetView?: boolean;
}) {
  const [err, setErr] = useState(false);
  const src = getDisplayImage(listing, { allowStreetView });

  if (!src || err) {
    return <HeroImageFallback variant="card" className="absolute inset-0 w-full h-full" />;
  }

  return (
    <Image
      src={src}
      alt={alt ?? listing.name ?? ''}
      fill
      sizes={sizes}
      className="object-cover group-hover:scale-105 transition-transform duration-300"
      unoptimized={!isOptimizedImageHost(src)}
      onError={() => setErr(true)}
    />
  );
}
