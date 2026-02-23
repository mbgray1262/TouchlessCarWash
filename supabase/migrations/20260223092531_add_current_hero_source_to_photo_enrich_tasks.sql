/*
  # Add current_hero_source to photo_enrich_tasks

  1. Changes
    - Adds `current_hero_source` (text, nullable) to `photo_enrich_tasks`
      so the photo-enrich pipeline can detect manually-set hero images
      and skip overwriting them.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photo_enrich_tasks' AND column_name = 'current_hero_source'
  ) THEN
    ALTER TABLE photo_enrich_tasks ADD COLUMN current_hero_source text;
  END IF;
END $$;
