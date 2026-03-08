-- Create an RPC function to reliably return review mine scan counts.
-- The Supabase JS client count queries were returning null for some filters.
CREATE OR REPLACE FUNCTION review_mine_counts()
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(
    'scanned_clean', (SELECT count(*) FROM listings WHERE review_mine_status = 'scanned_clean'),
    'touchless_found', (SELECT count(*) FROM listings WHERE review_mine_status = 'touchless_found'),
    'total_scanned', (SELECT count(*) FROM listings WHERE review_mine_status IS NOT NULL),
    'total_remaining', (SELECT count(*) FROM listings WHERE is_touchless = false AND review_mine_status IS NULL AND google_place_id IS NOT NULL AND google_category IN ('Car wash', 'car_wash'))
  );
$$;
