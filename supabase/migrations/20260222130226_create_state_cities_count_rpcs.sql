/*
  # Create helper RPCs for state/city listing counts

  ## Summary
  Several pages were fetching all touchless listing rows client-side to compute
  aggregate counts (distinct states, city counts per state). With 3,000+ touchless
  listings these queries were silently truncated at PostgREST's 1000-row default,
  producing wrong counts.

  ## New Functions

  ### `states_with_touchless_listings()`
  Returns a sorted array of state codes that have at least one touchless listing.
  Used by state pages to build the sidebar/navigation list.

  ### `cities_in_state_with_counts(p_state text)`
  Returns an array of JSON objects `{city, count}` for every city in the given state
  that has at least one touchless listing, sorted by count descending.
  Used by city pages to show the "Other cities" sidebar.
*/

CREATE OR REPLACE FUNCTION states_with_touchless_listings()
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT DISTINCT state
    FROM listings
    WHERE is_touchless = true
      AND state IS NOT NULL
    ORDER BY state
  );
$$;

GRANT EXECUTE ON FUNCTION states_with_touchless_listings() TO anon, authenticated;


CREATE OR REPLACE FUNCTION cities_in_state_with_counts(p_state text)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_agg(row_to_json(t) ORDER BY t.count DESC)
  FROM (
    SELECT city, COUNT(*)::integer AS count
    FROM listings
    WHERE is_touchless = true
      AND state = p_state
      AND city IS NOT NULL
    GROUP BY city
  ) t;
$$;

GRANT EXECUTE ON FUNCTION cities_in_state_with_counts(text) TO anon, authenticated;
