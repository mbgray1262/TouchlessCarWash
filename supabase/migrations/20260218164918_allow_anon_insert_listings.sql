/*
  # Allow anonymous inserts for listings table
  
  1. Changes
    - Add policy to allow anonymous users to insert listings
    - This enables the admin import functionality without authentication
  
  2. Security Notes
    - This is intended for admin use only
    - Consider adding authentication to the admin pages in production
    - The insert policy allows creation but doesn't expose data to public
*/

DROP POLICY IF EXISTS "Anonymous users can insert listings" ON listings;

CREATE POLICY "Anonymous users can insert listings"
  ON listings
  FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anonymous users can update listings" ON listings;

CREATE POLICY "Anonymous users can update listings"
  ON listings
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);