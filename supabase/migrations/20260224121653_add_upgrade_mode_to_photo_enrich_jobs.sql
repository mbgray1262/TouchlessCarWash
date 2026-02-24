/*
  # Add upgrade_mode to photo_enrich_jobs

  Adds a boolean column to track whether a job was started in "upgrade mode"
  (targeting listings with google/street_view heroes to replace with website photos)
  vs normal mode (targeting listings with no hero at all).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photo_enrich_jobs' AND column_name = 'upgrade_mode'
  ) THEN
    ALTER TABLE photo_enrich_jobs ADD COLUMN upgrade_mode boolean DEFAULT false;
  END IF;
END $$;
