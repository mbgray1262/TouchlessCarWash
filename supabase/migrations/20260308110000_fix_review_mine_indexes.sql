-- Revert false positive reclassifications (non-car-wash businesses)
UPDATE listings
SET is_touchless = false,
    is_approved = false,
    review_mine_status = NULL,
    review_extract_status = NULL,
    touchless_review_count = NULL,
    crawl_notes = NULL
WHERE review_mine_status = 'touchless_found'
  AND lower(google_category) NOT LIKE '%car wash%';

-- Delete false review snippets for non-car-wash businesses
DELETE FROM review_snippets
WHERE source = 'serpapi'
  AND listing_id IN (
    SELECT id FROM listings
    WHERE lower(google_category) NOT LIKE '%car wash%'
      AND google_category IS NOT NULL
  );

-- Create a composite partial index for the scan_batch query pattern
-- This makes the ILIKE filter fast by pre-filtering on car wash category
CREATE INDEX IF NOT EXISTS idx_listings_review_mine_scan
  ON listings(review_count DESC)
  WHERE is_touchless = false
    AND review_mine_status IS NULL
    AND google_place_id IS NOT NULL
    AND lower(google_category) LIKE '%car wash%';
