/*
  # Add google_place_id to listings

  ## Summary
  Adds a `google_place_id` column to the listings table for use as a reliable
  deduplication key during bulk spreadsheet imports. Google Place IDs are globally
  unique identifiers assigned by Google Maps to each business location.

  ## Changes
  - `listings.google_place_id` (text, nullable, unique) — stores the Google Place ID
    string (e.g. "ChIJ..."). Used as the ON CONFLICT target during bulk upserts so
    re-importing the same spreadsheet never creates duplicates.

  ## Notes
  - Column is nullable so existing rows and imports without a Place ID still work.
  - A partial unique index is used (WHERE google_place_id IS NOT NULL) so multiple
    NULL values are allowed without conflicting.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'google_place_id'
  ) THEN
    ALTER TABLE listings ADD COLUMN google_place_id text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS listings_google_place_id_unique
  ON listings (google_place_id)
  WHERE google_place_id IS NOT NULL;
