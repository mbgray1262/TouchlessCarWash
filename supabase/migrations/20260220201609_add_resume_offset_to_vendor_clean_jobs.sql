/*
  # Add resume_offset to vendor_clean_jobs

  Adds a `resume_offset` column so the clean-vendor-names edge function can
  process vendors in chunks and be called repeatedly to resume from where it
  left off, avoiding the ~400s edge function wall-clock timeout.

  Changes:
  - vendor_clean_jobs: add `resume_offset` integer column (default 0)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendor_clean_jobs' AND column_name = 'resume_offset'
  ) THEN
    ALTER TABLE vendor_clean_jobs ADD COLUMN resume_offset integer NOT NULL DEFAULT 0;
  END IF;
END $$;
