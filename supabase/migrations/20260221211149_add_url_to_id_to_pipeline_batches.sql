/*
  # Add url_to_id map to pipeline_batches

  Stores a JSON map of { originalUrl -> listingId } so the poll_batch action
  can look up listings by exact original URL instead of guessing via normalization.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pipeline_batches' AND column_name = 'url_to_id'
  ) THEN
    ALTER TABLE pipeline_batches ADD COLUMN url_to_id jsonb;
  END IF;
END $$;
