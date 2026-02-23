/*
  # Add firecrawl_url_trace column to photo_enrich_tasks

  ## Summary
  Adds a JSONB column to store the per-URL filter trace from Firecrawl scraping.
  Each entry records whether a raw image URL passed or was rejected by the keyword/extension
  filter, and if rejected, which rule caused the rejection.

  ## New Columns on photo_enrich_tasks
  - `firecrawl_url_trace` (jsonb) — array of { url, passed, reason } objects where reason
    explains which keyword matched or that the URL had no image extension
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photo_enrich_tasks' AND column_name = 'firecrawl_url_trace'
  ) THEN
    ALTER TABLE photo_enrich_tasks ADD COLUMN firecrawl_url_trace jsonb;
  END IF;
END $$;
