'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Play, Youtube, ArrowRight } from 'lucide-react';
import { TrackedYouTubeEmbed } from '@/components/TrackedYouTubeEmbed';

export type EquipmentVideo = { id: string; title: string; brand?: string | null };

// Fallback pool used only if the DB has no active videos (e.g. during the
// first deploy before the equipment_videos table is populated). The live pool
// is managed at /admin/videos and passed in via the `videos` prop. These are
// the most common US in-bay touchless systems actually washing cars at real
// locations — PDQ LaserWash 360 + WashWorld Razor — all verified embeddable.
const FALLBACK_VIDEOS: EquipmentVideo[] = [
  { id: 'uOreLJusX1U', title: 'PDQ LaserWash 360 Plus — full touchless wash' },
  { id: 'z7OvJIWFtGo', title: 'PDQ LaserWash 360 Plus touchless wash' },
  { id: 'O4frXLZWzRw', title: 'PDQ LaserWash 360 Plus touchless system' },
  { id: 'X6Ms4mlCOPc', title: 'WashWorld Razor EDGE touchless wash' },
  { id: 'S-yXmRv69do', title: 'WashWorld Razor touchless wash' },
  { id: 'QzVYH0V__U0', title: 'WashWorld Razor HyperForce touchless wash' },
];

function pickIndex(seed: string, len: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % len;
}

export function TouchlessVideo({
  listingId,
  videos,
  preferBrand,
}: {
  listingId: string;
  videos?: EquipmentVideo[];
  /** The listing's tagged equipment brand slug (e.g. "pdq"). When we have
   *  videos for that brand we silently prefer them — so the clip tends to
   *  match the equipment shown on this listing — without ever claiming an
   *  exact match. Falls back to the full pool when there's no match. */
  preferBrand?: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const fullPool = videos && videos.length > 0 ? videos : FALLBACK_VIDEOS;
  const branded = preferBrand ? fullPool.filter((v) => v.brand === preferBrand) : [];
  const pool = branded.length > 0 ? branded : fullPool;
  const video = pool[pickIndex(listingId, pool.length)];

  function handlePlay() {
    setPlaying(true);
    // Fire-and-forget engagement tracking (shows up as "Video Plays" in admin
    // stats). Never block playback or surface errors if tracking fails.
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, event_type: 'video_play' }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }

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
          <TrackedYouTubeEmbed youtubeId={video.id} location="listing" title={video.title} />
        ) : (
          <button
            type="button"
            onClick={handlePlay}
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

      {/* Funnel to the full video hub — drives curious visitors to a
          binge-able gallery (more pages per session) without crowding this
          page with extra heavy embeds. */}
      <div className="mt-4 text-center">
        <Link
          href="/videos"
          className="text-sm text-[#22C55E] hover:underline font-medium inline-flex items-center gap-1.5"
        >
          See more touchless washes in action
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
