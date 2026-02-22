/*
  # Create state_listing_counts RPC

  ## Summary
  Creates a fast server-side aggregate function that returns per-state counts
  of touchless listings. This replaces the previous approach of fetching all rows
  client-side (which was silently capped at 1000 by PostgREST's default row limit),
  causing incorrect counts and missing states on the home page.

  ## New Functions
  - `state_listing_counts()` — returns a JSON object mapping state code to count,
    only for states that have at least one touchless listing.

  ## Security
  - SECURITY DEFINER with explicit search_path for safety
  - Granted to anon and authenticated roles
*/

CREATE OR REPLACE FUNCTION state_listing_counts()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_object_agg(state, cnt)
  FROM (
    SELECT state, COUNT(*) AS cnt
    FROM listings
    WHERE is_touchless = true
      AND state IS NOT NULL
    GROUP BY state
  ) t;
$$;

GRANT EXECUTE ON FUNCTION state_listing_counts() TO anon, authenticated;
