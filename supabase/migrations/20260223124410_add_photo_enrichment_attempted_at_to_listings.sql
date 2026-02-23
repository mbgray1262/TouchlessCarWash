/*
  # Add photo_enrichment_attempted_at to listings

  Adds a timestamp column that is set whenever the photo enrichment pipeline
  processes a listing (success or failure). Listings with a non-null value are
  skipped on subsequent runs, preventing repeated re-processing of failed entries.
  Reset this column manually to allow a listing to be re-attempted.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'photo_enrichment_attempted_at'
  ) THEN
    ALTER TABLE listings ADD COLUMN photo_enrichment_attempted_at timestamptz;
  END IF;
END $$;
