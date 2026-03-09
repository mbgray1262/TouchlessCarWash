-- Index to speed up scan_batch queries which filter on review_mine_status IS NULL.
-- With 52K+ unscanned listings, the query was timing out without this index.
CREATE INDEX IF NOT EXISTS idx_listings_review_mine_status
  ON listings (review_mine_status);

-- Partial index specifically for unscanned listings ordered by review_count,
-- which is exactly what scan_batch does.
CREATE INDEX IF NOT EXISTS idx_listings_unscanned_by_reviews
  ON listings (review_count DESC)
  WHERE review_mine_status IS NULL
    AND google_place_id IS NOT NULL;
