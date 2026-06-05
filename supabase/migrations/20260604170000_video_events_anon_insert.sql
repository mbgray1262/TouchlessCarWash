-- Fix video_events RLS so /api/track-video inserts actually land in prod.
--
-- Symptoms (June 4 2026): the admin Stats "Avg. Video Watch" card stayed at
-- "no data yet" with zero rows in video_events, even though the API returned
-- 200/ok. Root cause is identical to the April 30 listing_events bug
-- (20260501000000): the table had RLS enabled with NO insert policy and NO
-- INSERT grant to anon, on the assumption that /api/track-video would write
-- with the service-role key. But SUPABASE_SERVICE_ROLE_KEY is not set on
-- Netlify, so the route falls back to the anon key — and every insert was
-- silently rejected by RLS ("new row violates row-level security policy"),
-- swallowed by the route's catch, and reported as ok.
--
-- Fix: mirror listing_events — grant INSERT to anon and add a permissive
-- anon insert policy, so writes work regardless of whether the service key
-- is present in the deploy environment. Reads still go only through the
-- SECURITY DEFINER video_event_stats() RPC (added in 20260604130000), so raw
-- rows stay private and only aggregates are exposed.

ALTER TABLE video_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert" ON video_events;
CREATE POLICY "anon_insert"
  ON video_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Critical: without the role-level GRANT the policy never even runs.
GRANT INSERT ON video_events TO anon;
GRANT INSERT ON video_events TO authenticated;
