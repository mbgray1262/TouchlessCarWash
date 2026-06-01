'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';

// One browsable video in the /videos hub. modelHref/modelName are optional:
// when the clip is tagged to a model we deep-link into that model's section on
// the vendor page, turning the gallery into an internal-linking hub.
export type GalleryVideo = {
  youtubeId: string;
  title: string;
  modelName: string | null;
  modelHref: string | null;
};

export type GalleryGroup = {
  brandSlug: string;
  brandLabel: string;
  brandHref: string;
  videos: GalleryVideo[];
};

// Lightweight gallery: each card shows a thumbnail and only swaps in the heavy
// YouTube iframe once the visitor clicks play, so the page stays fast even with
// 15+ videos. No play tracking here — listing_events needs a real listing UUID
// and the gallery has none (same rationale as the equipment pages).
export function VideoGallery({ groups }: { groups: GalleryGroup[] }) {
  const [playing, setPlaying] = useState<Set<string>>(new Set());
  const play = (id: string) =>
    setPlaying((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  return (
    <div className="space-y-12">
      {groups.map((group) => (
        <section key={group.brandSlug}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <h2 className="text-2xl font-bold text-[#0F2744]">{group.brandLabel}</h2>
            <Link
              href={group.brandHref}
              className="text-sm text-[#22C55E] hover:underline font-medium"
            >
              View {group.brandLabel} equipment →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {group.videos.map((v) => {
              const isPlaying = playing.has(v.youtubeId);
              return (
                <div
                  key={v.youtubeId}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col"
                >
                  <div className="relative w-full bg-black" style={{ aspectRatio: '16 / 9' }}>
                    {isPlaying ? (
                      <iframe
                        className="absolute inset-0 h-full w-full"
                        src={`https://www.youtube-nocookie.com/embed/${v.youtubeId}?autoplay=1&rel=0&modestbranding=1`}
                        title={v.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => play(v.youtubeId)}
                        aria-label={`Play video: ${v.title}`}
                        className="group absolute inset-0 h-full w-full"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`}
                          alt={v.title}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />
                        <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#22C55E] shadow-lg transition-transform group-hover:scale-110">
                          <Play className="ml-1 h-6 w-6 fill-white text-white" />
                        </span>
                      </button>
                    )}
                  </div>

                  <div className="p-4 flex-1 flex flex-col">
                    <p className="font-medium text-sm text-[#0F2744]">{v.title}</p>
                    {v.modelHref && v.modelName && (
                      <Link
                        href={v.modelHref}
                        className="text-xs text-[#22C55E] hover:underline mt-2 inline-block"
                      >
                        Learn about the {v.modelName} →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
