'use client';

/**
 * A YouTube embed that measures real watch time and reports it to
 * /api/track-video (→ video_events table → admin Stats "Avg. Video Watch
 * Time"). Uses the free YouTube IFrame Player API — no key, no quota, no cost.
 *
 * Design: the <iframe> is rendered by React so playback ALWAYS works, even if
 * the IFrame API script is blocked (adblock) or fails to load. The API is then
 * attached to that existing iframe purely for measurement — tracking is
 * best-effort and never gates playback.
 *
 * Watch time = wall-clock time the player spends in the PLAYING state. We send
 * once per session (first of: ENDED / page-hide / unmount) via sendBeacon so
 * the write survives navigation.
 */

import { useEffect, useId, useRef } from 'react';

let apiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as unknown as { YT?: { Player: unknown }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT && w.YT.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return apiPromise;
}

export function TrackedYouTubeEmbed({
  youtubeId,
  location,
  title,
}: {
  youtubeId: string;
  location: string;
  title: string;
}) {
  const rawId = useId();
  const frameId = `yt-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  const watched = useRef(0); // accumulated PLAYING seconds
  const playStart = useRef<number | null>(null);
  const duration = useRef(0);
  const sent = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let player: any = null;

    const accumulate = () => {
      if (playStart.current != null) {
        watched.current += (Date.now() - playStart.current) / 1000;
        playStart.current = null;
      }
    };

    const send = () => {
      accumulate();
      const secs = Math.round(watched.current);
      if (sent.current || secs < 1) return;
      sent.current = true;
      const payload = JSON.stringify({
        youtube_id: youtubeId,
        location,
        watched_seconds: secs,
        video_seconds: Math.round(duration.current) || null,
      });
      try {
        const blob = new Blob([payload], { type: 'application/json' });
        if (!navigator.sendBeacon || !navigator.sendBeacon('/api/track-video', blob)) {
          fetch('/api/track-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        /* ignore */
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onState = (e: any) => {
      const YT = (window as unknown as { YT: any }).YT;
      if (e.data === YT.PlayerState.PLAYING) {
        playStart.current = Date.now();
        if (!duration.current) duration.current = player?.getDuration?.() || 0;
      } else if (e.data === YT.PlayerState.PAUSED) {
        accumulate();
      } else if (e.data === YT.PlayerState.ENDED) {
        send();
      }
    };

    loadYouTubeApi().then(() => {
      if (cancelled) return;
      const YT = (window as unknown as { YT: any }).YT;
      if (!YT || !document.getElementById(frameId)) return;
      // Attach to the already-rendered iframe (it has enablejsapi=1).
      player = new YT.Player(frameId, { events: { onStateChange: onState } });
    });

    const onHide = () => {
      if (document.visibilityState === 'hidden') send();
    };
    window.addEventListener('pagehide', send);
    document.addEventListener('visibilitychange', onHide);

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', send);
      document.removeEventListener('visibilitychange', onHide);
      send(); // client-side navigation away
      try {
        player?.destroy?.();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeId, location]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <iframe
      id={frameId}
      className="absolute inset-0 h-full w-full"
      src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1${
        origin ? `&origin=${encodeURIComponent(origin)}` : ''
      }`}
      title={title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}
