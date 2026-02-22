/*
  # Add never_attempted_only flag to pipeline_jobs

  ## Changes
  - `pipeline_jobs`: adds `never_attempted_only` boolean column (default false)
    - When true, the classification pipeline only processes listings with crawl_status IS NULL
    - This allows targeted runs against the ~7,915 sites that have never been attempted
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pipeline_jobs' AND column_name = 'never_attempted_only'
  ) THEN
    ALTER TABLE pipeline_jobs ADD COLUMN never_attempted_only boolean NOT NULL DEFAULT false;
  END IF;
END $$;
