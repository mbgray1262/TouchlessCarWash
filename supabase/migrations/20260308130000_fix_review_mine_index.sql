-- Drop the old index that used lower()/LIKE which doesn't match IN queries
DROP INDEX IF EXISTS idx_listings_review_mine_scan;

-- Create index matching the exact query pattern used by scan_batch
CREATE INDEX IF NOT EXISTS idx_listings_review_mine_scan_v2
  ON listings(review_count DESC)
  WHERE is_touchless = false
    AND review_mine_status IS NULL
    AND google_place_id IS NOT NULL
    AND google_category IN ('Car wash', 'car_wash');
