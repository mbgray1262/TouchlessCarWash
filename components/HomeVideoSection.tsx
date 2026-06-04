'use client';

/**
 * Reusable "See a touchless wash in action" video module.
 *  - One main click-to-play YouTube player (lightweight: lazy thumbnail, no
 *    autoload — no perf/SEO hit until the visitor presses play).
 *  - A different featured video is picked on each visit (client-side, so it
 *    varies per load without an SSR hydration mismatch) — "rotation" via
 *    variety, NOT an auto-advancing carousel (auto-rotate lowers genuine
 *    watch time, which is the metric we're trying to grow).
 *  - A thumbnail strip lets visitors switch to any other video themselves.
 *  - enablejsapi=1 lets GA4's built-in video-engagement tracking record
 *    start / 25 / 50 / 75 / complete; we also fire a manual GA4 play event
 *    tagged with `location` so each placement (homepage/blog/paint-safe) is
 *    distinguishable in reports.
 *
 * `TouchlessVideoModule` is the bare module (no section chrome) so callers can
 * drop it into any container width. `HomeVideoSection` wraps it in the
 * full-width homepage section.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Play, Youtube, ArrowRight } from 'lucide-react';

export type HomeVideo = { youtubeId: string; title: string };

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function TouchlessVideoModule({
  videos,
  location = 'homepage',
  heading = 'See a Touchless Wash in Action',
  subheading = 'Real touchless equipment washing a car — high-pressure water and detergents, no brushes, no contact.',
}: {
  videos: HomeVideo[];
  location?: string;
  heading?: string;
  subheading?: string;
}) {
  const [featured, setFeatured] = useState(0);
  const [playing, setPlaying] = useState(false);

  // New featured video each load — client-only to avoid hydration mismatch.
  useEffect(() => {
    if (videos.length > 1) setFeatured(Math.floor(Math.random() * videos.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!videos || videos.length === 0) return null;
  const video = videos[featured] ?? videos[0];

  function selectVideo(i: number) {
    setFeatured(i);
    setPlaying(false); // swap to the picked video's thumbnail; visitor taps play
  }

  function handlePlay() {
    setPlaying(true);
    try {
      window.gtag?.('event', 'video_play', {
        location,
        video_id: video.youtubeId,
        video_title: video.title,
      });
    } catch {
      /* tracking must never break playback */
    }
  }

  return (
    <>
      <div className="text-center mb-8">
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 flex items-center justify-center gap-2.5">
          <Youtube className="w-7 h-7 text-[#22C55E]" />
          {heading}
        </h2>
        {subheading && (
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{subheading}</p>
        )}
      </div>

      <div
        className="relative w-full overflow-hidden rounded-2xl bg-black shadow-lg"
        style={{ aspectRatio: '16 / 9' }}
      >
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={handlePlay}
            aria-label={`Play video: ${video.title}`}
            className="group absolute inset-0 h-full w-full"
          >
            <img
              src={`https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`}
              alt={video.title}
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/15" />
            <span className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#22C55E] shadow-lg transition-transform group-hover:scale-110">
              <Play className="ml-1 h-9 w-9 fill-white text-white" />
            </span>
          </button>
        )}
      </div>

      <p className="text-center text-sm text-gray-500 mt-3">{video.title}</p>

      {videos.length > 1 && (
        <div className="mt-5 grid grid-cols-3 sm:grid-cols-6 gap-3">
          {videos.map((v, i) => (
            <button
              key={v.youtubeId}
              type="button"
              onClick={() => selectVideo(i)}
              aria-label={`Show video: ${v.title}`}
              aria-current={i === featured}
              className={`relative overflow-hidden rounded-lg border-2 transition ${
                i === featured
                  ? 'border-[#22C55E] ring-2 ring-[#22C55E]/30'
                  : 'border-transparent hover:border-gray-300'
              }`}
              style={{ aspectRatio: '16 / 9' }}
            >
              <img
                src={`https://i.ytimg.com/vi/${v.youtubeId}/mqdefault.jpg`}
                alt={v.title}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {i !== featured && <span className="absolute inset-0 bg-black/10" />}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 text-center">
        <Link
          href="/videos"
          className="inline-flex items-center gap-1.5 text-[#22C55E] hover:underline font-medium"
        >
          See all touchless car wash videos
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </>
  );
}

export function HomeVideoSection({ videos }: { videos: HomeVideo[] }) {
  if (!videos || videos.length === 0) return null;
  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4 max-w-5xl">
        <TouchlessVideoModule videos={videos} location="homepage" />
      </div>
    </section>
  );
}
