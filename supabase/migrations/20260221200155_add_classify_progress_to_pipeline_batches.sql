/*
  # Add classification progress tracking to pipeline_batches

  ## Problem
  Classification progress was only tracked in-memory React state,
  so reloading the page loses all progress info and the UI can't tell
  whether classification has started, is in progress, or is complete.

  ## Changes
  - Adds `classify_status` column: null | 'running' | 'completed' | 'failed'
  - Adds `classified_count` integer: how many items have been classified so far
  - Adds `classify_started_at` timestamp: when classification began
  - Adds `classify_completed_at` timestamp: when classification finished

  These fields let the UI show accurate, persistent classification state
  across page reloads and browser tabs.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pipeline_batches' AND column_name = 'classify_status'
  ) THEN
    ALTER TABLE pipeline_batches ADD COLUMN classify_status text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pipeline_batches' AND column_name = 'classified_count'
  ) THEN
    ALTER TABLE pipeline_batches ADD COLUMN classified_count integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pipeline_batches' AND column_name = 'classify_started_at'
  ) THEN
    ALTER TABLE pipeline_batches ADD COLUMN classify_started_at timestamptz DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pipeline_batches' AND column_name = 'classify_completed_at'
  ) THEN
    ALTER TABLE pipeline_batches ADD COLUMN classify_completed_at timestamptz DEFAULT NULL;
  END IF;
END $$;
