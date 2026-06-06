'use client';

/**
 * Hero image for the /best metro ranking cards that can NEVER render broken.
 * Server components can't attach onError, so this client wrapper swaps to the
 * generic HeroImageFallback if the chosen URL fails to load (404, expired
 * Google photo reference, dead external hotlink, etc.).
 */

import { useState } from 'react';
import Image from 'next/image';
import HeroImageFallback from '@/components/HeroImageFallback';

function isOptimizedImageHost(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h.includes('supabase.co') || h.includes('googleusercontent.com');
  } catch {
    return false;
  }
}

export default function BestCardImage({ src, alt }: { src: string | null; alt: string }) {
  const [err, setErr] = useState(false);

  if (!src || err) {
    return (
      <div className="relative h-52 md:h-full">
        <HeroImageFallback variant="card" className="h-full" />
      </div>
    );
  }

  return (
    <div className="relative h-52 md:h-full">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100vw, 288px"
        className="object-cover group-hover:scale-105 transition-transform duration-300"
        unoptimized={!isOptimizedImageHost(src)}
        onError={() => setErr(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-black/30 to-transparent" />
    </div>
  );
}
