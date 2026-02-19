/*
  # Add last_crawled_at to listings table
  
  1. Changes
    - Add `last_crawled_at` timestamp column to track when listings were last verified
    - Add index on crawl_status for efficient filtering of pending verifications
  
  2. Notes
    - This field tracks when Firecrawl last verified if a car wash is touchless
    - Used for scheduling re-verification and showing verification freshness
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'last_crawled_at'
  ) THEN
    ALTER TABLE listings ADD COLUMN last_crawled_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_listings_crawl_status ON listings(crawl_status) WHERE crawl_status IS NOT NULL;