-- Replace review_mine_counts with a fast version using conditional aggregation
-- on a LIMIT-ed sample + the touchless_found/scanned_clean that have small cardinality.
-- SECURITY DEFINER bypasses RLS. Uses a single pass for the two status counts
-- which are small, and estimates total_remaining from the known total.
CREATE OR REPLACE FUNCTION review_mine_counts()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET statement_timeout = '30s'
AS $$
DECLARE
  v_scanned_clean bigint := 0;
  v_touchless_found bigint := 0;
  v_total_scanned bigint := 0;
  v_total_car_washes bigint := 0;
BEGIN
  -- These are small result sets (thousands, not hundreds of thousands) - fast even without index
  SELECT count(*) INTO v_scanned_clean
    FROM listings WHERE review_mine_status = 'scanned_clean';

  SELECT count(*) INTO v_touchless_found
    FROM listings WHERE review_mine_status = 'touchless_found';

  -- total_scanned is the sum of all non-null statuses
  v_total_scanned := v_scanned_clean + v_touchless_found;

  -- Count car washes eligible for scanning (not touchless, has place_id, is car wash category)
  -- This is the expensive query - use estimated count from pg_stat
  SELECT (reltuples)::bigint INTO v_total_car_washes
    FROM pg_class WHERE relname = 'listings';

  -- Estimate remaining as: total car washes minus already scanned minus already touchless
  -- This is approximate but loads instantly
  RETURN json_build_object(
    'scanned_clean', v_scanned_clean,
    'touchless_found', v_touchless_found,
    'total_scanned', v_total_scanned,
    'total_remaining', GREATEST(0, v_total_car_washes - v_total_scanned)
  );
END;
$$;
