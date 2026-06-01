'use client';

import { useState } from 'react';
import { Play, Youtube } from 'lucide-react';

// Curated pool of generic, evergreen touchless-wash explainer videos. These are
// intentionally NOT matched to any listing's equipment — they explain how
// touchless washing works in general, so they are safe for every location.
// All verified public + embeddable. Rotated by listing id for variety.
const VIDEOS: { id: string; title: string }[] = [
  { id: 'wtbbcsBTHl4', title: 'How do touchless car washes work?' },
  { id: '3Kfh4WQtq6A', title: 'Touchless automatic car washes' },
  { id: 'xAvWxFeXrko', title: 'A touchless wash cleaning a dirty car' },
  { id: '6XedoKvOTL0', title: 'How to use a touchless wash and avoid swirls' },
  { id: 'br2qSO0TkZw', title: 'Is a contactless wash really cleaning your car?' },
  { id: '81sSltx4kag', title: 'The truth about touchless washing' },
];

function pickIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % VIDEOS.length;
}

export function TouchlessVideo({ listingId }: { listingId: string }) {
  const [playing, setPlaying] = useState(false);
  const video = VIDEOS[pickIndex(listingId)];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-lg font-bold text-[#0F2744] mb-1 flex items-center gap-2">
        <Youtube className="w-5 h-5 text-[#22C55E]" />
        How Touchless Car Washes Work
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        A quick video on what to expect from a touchless wash.
      </p>

      <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '16 / 9' }}>
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play video: ${video.title}`}
            className="group absolute inset-0 h-full w-full"
          >
            <img
              src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
              alt={video.title}
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
    </div>
  );
}
