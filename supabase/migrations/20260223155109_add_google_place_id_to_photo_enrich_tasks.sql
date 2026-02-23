/*
  # Add Google Place ID tracking to photo_enrich_tasks

  ## Changes
  - `photo_enrich_tasks`: add `google_place_id` (text) — the Place ID passed into the task so
    the pipeline can call the Place Photos API during enrichment
  - `photo_enrich_tasks`: add `google_place_photos_approved` (int, default 0) — how many
    additional gallery photos were collected from Place Photos in this run
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photo_enrich_tasks' AND column_name = 'google_place_id'
  ) THEN
    ALTER TABLE photo_enrich_tasks ADD COLUMN google_place_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photo_enrich_tasks' AND column_name = 'google_place_photos_approved'
  ) THEN
    ALTER TABLE photo_enrich_tasks ADD COLUMN google_place_photos_approved integer NOT NULL DEFAULT 0;
  END IF;
END $$;
