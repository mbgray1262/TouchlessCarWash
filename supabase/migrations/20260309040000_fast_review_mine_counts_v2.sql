-- Replace review_mine_counts with a version that counts in smaller, faster steps.
-- Uses SECURITY DEFINER to bypass RLS and a generous timeout.
CREATE OR REPLACE FUNCTION review_mine_counts()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
  SELECT json_build_object(
    'scanned_clean', (SELECT count(*) FROM listings WHERE review_mine_status = 'scanned_clean'),
    'touchless_found', (SELECT count(*) FROM listings WHERE review_mine_status = 'touchless_found'),
    'total_scanned', (SELECT count(*) FROM listings WHERE review_mine_status IS NOT NULL),
    'total_remaining', (SELECT count(*) FROM listings WHERE is_touchless = false AND review_mine_status IS NULL AND google_place_id IS NOT NULL AND google_category IN ('Car wash', 'car_wash'))
  );
$$;
