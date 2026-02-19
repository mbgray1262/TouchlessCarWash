/*
  # Add touchless evidence column

  1. Changes
    - Add `touchless_evidence` column to `listings` table to store HTML/text snippets that prove touchless status
    - This will contain an array of text snippets showing the context where touchless keywords were found
  
  2. Notes
    - JSONB array allows us to store multiple evidence snippets
    - Useful for transparency and manual verification
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'touchless_evidence'
  ) THEN
    ALTER TABLE listings ADD COLUMN touchless_evidence JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;