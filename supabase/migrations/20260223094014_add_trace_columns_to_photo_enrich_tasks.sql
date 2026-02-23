/*
  # Add per-step trace columns to photo_enrich_tasks

  ## Summary
  Adds detailed diagnostic columns to photo_enrich_tasks so that each listing's
  enrichment run captures a full trace of what happened at every step. This
  enables the admin UI to show a per-listing breakdown for debugging why photos
  are (or aren't) being selected.

  ## New Columns on photo_enrich_tasks
  - `google_photo_exists` (boolean) — whether google_photo_url was present
  - `google_verdict` (text) — Claude's classification: GOOD / BAD_CONTACT / BAD_OTHER / fetch_failed / skipped
  - `google_reason` (text) — Claude's one-sentence reason for the verdict
  - `website_photos_db_count` (integer) — number of website_photos already in DB before screening
  - `website_photos_screened` (integer) — how many website_photos were sent to Claude
  - `website_photos_approved` (integer) — how many passed screening from the DB set
  - `firecrawl_triggered` (boolean) — whether Firecrawl scraping was attempted
  - `firecrawl_images_found` (integer) — raw image count returned by Firecrawl
  - `firecrawl_candidates` (integer) — images that passed URL filtering
  - `firecrawl_approved` (integer) — images that passed Claude vision screening
  - `total_approved` (integer) — total approved photos across all steps
  - `final_hero_source` (text) — reason/source for the chosen hero image
  - `fallback_reason` (text) — why street view was used (if applicable)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photo_enrich_tasks' AND column_name = 'google_photo_exists'
  ) THEN
    ALTER TABLE photo_enrich_tasks
      ADD COLUMN google_photo_exists boolean,
      ADD COLUMN google_verdict text,
      ADD COLUMN google_reason text,
      ADD COLUMN website_photos_db_count integer DEFAULT 0,
      ADD COLUMN website_photos_screened integer DEFAULT 0,
      ADD COLUMN website_photos_approved integer DEFAULT 0,
      ADD COLUMN firecrawl_triggered boolean DEFAULT false,
      ADD COLUMN firecrawl_images_found integer DEFAULT 0,
      ADD COLUMN firecrawl_candidates integer DEFAULT 0,
      ADD COLUMN firecrawl_approved integer DEFAULT 0,
      ADD COLUMN total_approved integer DEFAULT 0,
      ADD COLUMN fallback_reason text;
  END IF;
END $$;
