-- Video watch-time tracking for the admin Stats page ("Avg. Video Watch Time").
-- One row per watch session, written by /api/track-video (service-role key, so
-- it bypasses RLS) when a viewer pauses / finishes / leaves the page. Watch
-- seconds are measured client-side via the free YouTube IFrame Player API — no
-- paid API is involved. Aggregate reads use the SECURITY DEFINER RPC below so
-- anon never reads or writes raw rows.
CREATE TABLE IF NOT EXISTS video_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_id text,
  location text,                       -- homepage | blog | paint-safe | listing | ...
  watched_seconds integer NOT NULL,    -- seconds the video was actually playing
  video_seconds integer,               -- total length of the video, if known
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_events_created ON video_events(created_at);

ALTER TABLE video_events ENABLE ROW LEVEL SECURITY;
-- Intentionally no anon/authenticated policies: writes come from the
-- service-role key in /api/track-video; reads come from the RPC below.

CREATE OR REPLACE FUNCTION video_event_stats()
RETURNS TABLE(sessions bigint, avg_seconds numeric, total_seconds bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint                              AS sessions,
    COALESCE(round(avg(watched_seconds)), 0)::numeric AS avg_seconds,
    COALESCE(sum(watched_seconds), 0)::bigint     AS total_seconds
  FROM video_events
  WHERE watched_seconds > 0;
$$;

GRANT EXECUTE ON FUNCTION video_event_stats() TO anon, authenticated, service_role;
