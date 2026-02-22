/*
  # Add hero_image_source column to listings

  ## Changes
  - Adds `hero_image_source` (text) column to `listings` table
    - Tracks where the hero image came from: 'google', 'website', 'street_view', or 'manual'
    - Nullable — null means unset/legacy

  ## Notes
  - Safe: uses IF NOT EXISTS pattern
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'hero_image_source'
  ) THEN
    ALTER TABLE listings ADD COLUMN hero_image_source text;
  END IF;
END $$;
