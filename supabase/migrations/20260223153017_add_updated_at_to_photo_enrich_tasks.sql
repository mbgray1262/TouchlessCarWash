/*
  # Add updated_at to photo_enrich_tasks

  Adds an auto-updating updated_at timestamp column to photo_enrich_tasks so the
  photo-enrich edge function can detect tasks that have been in_progress for more
  than 60 seconds and reset them to pending (self-healing recovery).
*/

ALTER TABLE photo_enrich_tasks
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'photo_enrich_tasks_updated_at'
  ) THEN
    CREATE TRIGGER photo_enrich_tasks_updated_at
      BEFORE UPDATE ON photo_enrich_tasks
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

UPDATE photo_enrich_tasks SET updated_at = now() WHERE updated_at IS NULL;
