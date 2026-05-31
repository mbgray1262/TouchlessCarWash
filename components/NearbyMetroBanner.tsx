'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, ArrowRight, X } from 'lucide-react';

/** Passive "near you" suggestion banner. Suggestion only — never auto-redirects.
 *  Dismissal is remembered per-metro in localStorage. */
export function NearbyMetroBanner({ slug, label }: { slug: string; label: string }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage.getItem('hideNearbyMetro') === slug) {
      setHidden(true);
    }
  }, [slug]);

  if (hidden) return null;

  return (
    <div className="bg-blue-50 border-b border-blue-200">
      <div className="container mx-auto px-4 py-2.5 flex items-center justify-center gap-2 text-sm flex-wrap">
        <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-[#0F2744]">Touchless car washes near you:</span>
        <Link
          href={`/best/${slug}`}
          className="font-semibold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
        >
          {label}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            window.localStorage.setItem('hideNearbyMetro', slug);
            setHidden(true);
          }}
          className="ml-1 text-blue-400 hover:text-blue-700"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
