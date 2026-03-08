-- Add review_mine_status column to track which listings have been scanned
-- via the SerpAPI review mining process.
-- Values: NULL = not scanned, 'scanned_clean' = no touchless evidence, 'touchless_found' = touchless reviews found

ALTER TABLE listings ADD COLUMN IF NOT EXISTS review_mine_status text;

-- Partial index for efficiently finding unscanned listings
CREATE INDEX IF NOT EXISTS idx_listings_review_mine_unscanned
  ON listings(review_mine_status)
  WHERE review_mine_status IS NULL;

-- Index for finding listings flagged as touchless via review mining
CREATE INDEX IF NOT EXISTS idx_listings_review_mine_found
  ON listings(review_mine_status)
  WHERE review_mine_status = 'touchless_found';
