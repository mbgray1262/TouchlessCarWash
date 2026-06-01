'use client';

import { useState } from 'react';
import { Play, Youtube } from 'lucide-react';

// Curated pool of real touchless equipment-in-action footage (robotic-arch wash
// process + a real customer POV drive-through) — NOT talking-head explainers.
// These are generic, evergreen clips intentionally NOT matched to any listing's
// specific equipment, so they are safe for every location. All verified public +
// embeddable. Rotated by listing id for variety.
const VIDEOS: { id: string; title: string }[] = [
  { id: 'maLC0s1YEBs', title: 'Touchless wash — full automatic process' },
  { id: 'ZjqRLZL4boc', title: 'Touchless washing robot with moving dryer' },
  { id: 'o3An-VWWXYM', title: 'Touchless wash with high-power air drying' },
  { id: 'si2AFsPUGXA', title: 'Compact touchless wash — full process' },
  { id: '8rUdWbXJxfY', title: 'POV: driving through a touchless wash' },
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
        See a Touchless Wash in Action
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        Real touchless equipment washing a car — no brushes, no contact.
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
