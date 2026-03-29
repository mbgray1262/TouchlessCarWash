-- Update review_mine_counts to include gas stations with "wash" in the name,
-- matching the scan_batch query in the edge function.
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
  v_total_remaining bigint := 0;
BEGIN
  SELECT count(*) INTO v_scanned_clean
    FROM listings WHERE review_mine_status = 'scanned_clean';

  SELECT count(*) INTO v_touchless_found
    FROM listings WHERE review_mine_status = 'touchless_found';

  v_total_scanned := v_scanned_clean + v_touchless_found;

  SELECT count(*) INTO v_total_remaining
    FROM listings
    WHERE review_mine_status IS NULL
      AND (is_touchless = false OR is_touchless IS NULL)
      AND google_place_id IS NOT NULL
      AND (
        google_category IN ('Car wash', 'car_wash', 'Self service car wash')
        OR (google_category IS NULL AND (lower(name) LIKE '%car wash%' OR lower(name) LIKE '%carwash%'))
        OR (google_category = 'Gas station' AND lower(name) LIKE '%wash%')
      );

  RETURN json_build_object(
    'scanned_clean', v_scanned_clean,
    'touchless_found', v_touchless_found,
    'total_scanned', v_total_scanned,
    'total_remaining', v_total_remaining
  );
END;
$$;
