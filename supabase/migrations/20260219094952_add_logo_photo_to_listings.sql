/*
  # Add logo_photo column to listings

  ## Summary
  Adds a `logo_photo` text column to store the URL of the photo that has been
  identified as the company logo for a listing. This is separate from hero_image
  (which is the main display photo) — the logo field lets admins tag which
  scraped photo is the brand logo so it can be used appropriately in the UI
  and excluded from hero selection.

  ## Changes
  - `listings.logo_photo` (text, nullable) — URL of the photo tagged as the company logo
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'logo_photo'
  ) THEN
    ALTER TABLE listings ADD COLUMN logo_photo text;
  END IF;
END $$;
