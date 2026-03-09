DROP INDEX IF EXISTS idx_listings_unscanned_by_reviews;
CREATE INDEX IF NOT EXISTS idx_listings_unscanned_by_reviews
  ON listings (review_count DESC NULLS LAST)
  WHERE review_mine_status IS NULL
    AND google_place_id IS NOT NULL;
