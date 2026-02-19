/*
  # Add blocked_photos column to listings

  1. Changes
    - `listings` table: add `blocked_photos` (text array, default empty)
      - Stores URLs of photos that have been manually blocked by an admin
      - Blocked photos will not appear in public-facing image galleries
      - Can be unblocked at any time by removing from this array

  2. Notes
    - Default is an empty array so all existing rows have a valid value
    - No RLS changes needed (same table policies apply)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'blocked_photos'
  ) THEN
    ALTER TABLE listings ADD COLUMN blocked_photos text[] DEFAULT '{}';
  END IF;
END $$;
