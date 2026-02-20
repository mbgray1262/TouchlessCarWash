/*
  # Add Bulk Verification Pipeline Columns

  ## Summary
  Adds columns required by the new bulk verification pipeline to the listings table.
  All additions are non-destructive — existing rows keep their current data and all
  new columns have sensible defaults so nothing breaks.

  ## New Columns

  ### listings table
  - `verification_status` (text, default 'unverified') — tracks where a listing is in
    the pipeline: 'unverified' | 'crawl_pending' | 'crawled' | 'crawl_failed' |
    'auto_classified' | 'approved' | 'rejected'
  - `classification_confidence` (integer, nullable) — 0–100 confidence score returned
    by Claude during batch classification
  - `classification_source` (text, nullable) — how classification was determined:
    'direct' (Claude analysed this listing's own snapshot) or
    'chain_inferred' (result copied from a representative chain location)
  - `logo_url` (text, nullable) — URL of the detected / selected business logo image.
    Stored alongside hero_image; rendered in listing cards.

  ## Notes
  - All columns added with IF NOT EXISTS guards so re-running is safe.
  - An index on `verification_status` is added to speed up pipeline dashboard queries.
  - `crawl_status` already exists; we backfill `verification_status` from it where
    possible so the pipeline dashboard shows accurate starting counts.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE listings ADD COLUMN verification_status text NOT NULL DEFAULT 'unverified';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'classification_confidence'
  ) THEN
    ALTER TABLE listings ADD COLUMN classification_confidence integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'classification_source'
  ) THEN
    ALTER TABLE listings ADD COLUMN classification_source text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE listings ADD COLUMN logo_url text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_listings_verification_status
  ON listings (verification_status);

UPDATE listings
SET verification_status =
  CASE
    WHEN is_approved = true                           THEN 'approved'
    WHEN crawl_status = 'failed'                      THEN 'crawl_failed'
    WHEN crawl_snapshot IS NOT NULL
         AND is_touchless IS NOT NULL                 THEN 'auto_classified'
    WHEN crawl_snapshot IS NOT NULL                   THEN 'crawled'
    ELSE 'unverified'
  END
WHERE verification_status = 'unverified';
