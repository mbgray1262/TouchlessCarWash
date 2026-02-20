/*
  # Fix anon RLS policies for bulk import

  Ensures anonymous users can insert and update listings,
  which is required for the bulk import flow.
*/

DROP POLICY IF EXISTS "Allow anon insert" ON listings;
DROP POLICY IF EXISTS "Allow anon update" ON listings;
DROP POLICY IF EXISTS "Anonymous users can update listings" ON listings;

CREATE POLICY "Allow anon insert" ON listings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update" ON listings FOR UPDATE TO anon USING (true) WITH CHECK (true);
