import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Server-side client. Prefer the service-role key when present, but fall back
// to the anon key — which works because video_events has an anon INSERT policy
// (migration 20260604170000), matching how /api/track writes listing_events.
// SUPABASE_SERVICE_ROLE_KEY is not set on Netlify, so without that anon policy
// every insert here is silently rejected by RLS.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const VALID_LOCATIONS = new Set(['homepage', 'blog', 'paint-safe', 'listing', 'videos-hub', 'equipment']);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { youtube_id, location, watched_seconds, video_seconds } = body ?? {};

    const secs = Math.round(Number(watched_seconds));
    if (!Number.isFinite(secs) || secs < 1) {
      // Nothing meaningful watched — ignore (keeps the average honest).
      return NextResponse.json({ ok: true });
    }
    // Clamp to a sane ceiling so a stuck timer can't poison the average.
    const cappedWatched = Math.min(secs, 7200);
    const len = Math.round(Number(video_seconds));
    const cappedLen = Number.isFinite(len) && len > 0 ? Math.min(len, 7200) : null;

    const { error } = await supabaseAdmin.from('video_events').insert({
      youtube_id: typeof youtube_id === 'string' ? youtube_id.slice(0, 32) : null,
      location: VALID_LOCATIONS.has(location) ? location : 'other',
      watched_seconds: cappedWatched,
      video_seconds: cappedLen,
    } as Record<string, unknown>);

    if (error) console.error('video_events insert failed:', error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('track-video POST error:', err);
    return NextResponse.json({ ok: true }); // tracking must never break UX
  }
}
