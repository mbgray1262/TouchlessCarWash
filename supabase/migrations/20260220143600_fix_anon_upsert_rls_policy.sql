/*
  # Fix anonymous upsert RLS policy for listings

  ## Problem
  Bulk import uses upsert (INSERT ... ON CONFLICT DO UPDATE) with the anon key.
  Postgres evaluates both INSERT and UPDATE RLS policies during an upsert.
  The existing anonymous UPDATE policy was missing a WITH CHECK clause,
  causing the upsert conflict-update path to fail RLS.

  ## Changes
  - Drops the existing anonymous UPDATE policy (no WITH CHECK)
  - Recreates it with WITH CHECK (true) so upsert operations succeed for anon users
*/

DROP POLICY IF EXISTS "Anonymous users can update listings" ON public.listings;

CREATE POLICY "Anonymous users can update listings"
  ON public.listings
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
