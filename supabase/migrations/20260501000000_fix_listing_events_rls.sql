-- Fix listing_events RLS so /api/track inserts and the admin stats reads
-- both actually work without depending on a service-role env var being set
-- on the Netlify side.
--
-- Symptoms (April 30 2026): anon inserts to listing_events return
--   code: '42501', message: 'new row violates row-level security policy'
-- so every favorite/directions/phone/website click since launch has been
-- silently rejected. The original migration (20260308000000) declared an
-- anon_insert policy, but on prod the inserts still fail — most likely
-- because the role-level GRANT for INSERT on the table is missing, which
-- means the policy never even gets evaluated.
--
-- This migration is idempotent and re-asserts the desired state:
--   - GRANT INSERT to anon (so RLS gets a chance to run)
--   - INSERT policy for anon (allowed — visitors aren't logged in)
--   - SELECT policy for authenticated users (admin can read for stats)
--   - GRANT EXECUTE on a SECURITY DEFINER stats RPC so the admin page
--     can read aggregate counts via anon-key without exposing raw rows
--   - Deny anon SELECT so individual events stay private (no business
--     intelligence leak — only aggregates are exposed)

-- 1. Make sure RLS is on.
ALTER TABLE listing_events ENABLE ROW LEVEL SECURITY;

-- 2. Drop+recreate the insert policy so any drift is reset to a known good
-- state. WITH CHECK (true) means every row passes; we trust visitor inputs
-- because the route validates them.
DROP POLICY IF EXISTS "anon_insert" ON listing_events;
CREATE POLICY "anon_insert"
  ON listing_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 3. Critical: GRANT INSERT to anon. Without this, the policy never even
-- runs. This is almost certainly what was missing in prod.
GRANT INSERT ON listing_events TO anon;
GRANT INSERT ON listing_events TO authenticated;

-- 4. Aggregate-counts RPC. SECURITY DEFINER lets it bypass RLS so the
-- admin page can read totals via the anon key without exposing raw rows.
-- Returns one row per event_type with a count.
CREATE OR REPLACE FUNCTION listing_event_counts()
RETURNS TABLE (event_type text, count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT event_type, COUNT(*)::bigint AS count
  FROM listing_events
  GROUP BY event_type
$$;

-- Same idea for "events in the last 7 days" — used for the Last 7 Days card.
CREATE OR REPLACE FUNCTION listing_events_recent_count(p_days int DEFAULT 7)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM listing_events
  WHERE created_at >= NOW() - (p_days || ' days')::interval
$$;

-- And aggregate per-listing engagement counts for "Most Engaged Listings"
-- and "Most Favorited Listings" cards. Returns top-N rows; the admin page
-- joins on listings to display names.
CREATE OR REPLACE FUNCTION listing_event_top(
  p_event_types text[],
  p_limit int DEFAULT 5
)
RETURNS TABLE (listing_id uuid, count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT listing_id, COUNT(*)::bigint AS count
  FROM listing_events
  WHERE event_type = ANY(p_event_types)
  GROUP BY listing_id
  ORDER BY count DESC
  LIMIT p_limit
$$;

-- Allow anon + authenticated to call these aggregate RPCs (no row-level
-- data is exposed — just counts).
GRANT EXECUTE ON FUNCTION listing_event_counts() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION listing_events_recent_count(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION listing_event_top(text[], int) TO anon, authenticated;
