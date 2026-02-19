/*
  # Add Crawl Snapshot Storage

  1. Changes
    - Add `crawl_snapshot` column to store full Firecrawl response data
    - This includes markdown, HTML, metadata, and any other data returned by Firecrawl
    - Enables future extraction of amenities, hours, photos, and other information without re-crawling

  2. Notes
    - JSONB type allows efficient querying and indexing if needed later
    - Column is nullable since existing records won't have this data
    - Future crawls will populate this field automatically
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'crawl_snapshot'
  ) THEN
    ALTER TABLE listings ADD COLUMN crawl_snapshot jsonb;
  END IF;
END $$;

COMMENT ON COLUMN listings.crawl_snapshot IS 'Full Firecrawl response data including markdown, HTML, and metadata for future analysis';