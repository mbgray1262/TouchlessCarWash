'use client';

import { useState } from 'react';
import { Play, Youtube } from 'lucide-react';

// Lightweight player for equipment model pages. Unlike the listing-page
// TouchlessVideo (which rotates a shared pool and tracks plays against a
// listing UUID), this shows ONE admin-tagged clip of the exact model the page
// is about, so it's always on-topic. No play tracking here: listing_events
// requires a real listing UUID, and equipment pages don't have one.
export function EquipmentModelVideo({ youtubeId, modelName }: { youtubeId: string; modelName: string }) {
  const [playing, setPlaying] = useState(false);
  const title = `${modelName} touchless car wash in action`;

  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <Youtube className="w-6 h-6 text-[#22C55E]" />
        See the {modelName} in Action
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Watch the {modelName} wash a car — no brushes, no contact.
      </p>

      <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '16 / 9' }}>
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play video: ${title}`}
            className="group absolute inset-0 h-full w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
              alt={title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />
            <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#22C55E] shadow-lg transition-transform group-hover:scale-110">
              <Play className="ml-1 h-7 w-7 fill-white text-white" />
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
