/*
  # Add batch_type column to pipeline_batches

  Adds a batch_type column to distinguish between different types of Firecrawl batches:
  - 'classify': standard classification pipeline batches
  - 'enrich': enrichment batches for touchless listings (photos + amenities backfill)

  Existing rows default to 'classify'.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pipeline_batches' AND column_name = 'batch_type'
  ) THEN
    ALTER TABLE pipeline_batches ADD COLUMN batch_type text NOT NULL DEFAULT 'classify';
  END IF;
END $$;