/*
  # Fix listings anon SELECT policy

  ## Problem
  The current anon SELECT policy restricts to `is_approved = true` only. This means:
  - Only 79 out of 55,000+ listings are visible to the public
  - The home page shows 0 touchless listings
  - The pipeline stats page shows wrong counts (only sees approved listings)
  - 27,000+ classifications done overnight are invisible

  ## Fix
  Drop the restrictive `is_approved = true` anon policy and replace it with
  an open policy so all listings are publicly readable. This is a public
  car wash directory — all listings should be visible.
*/

DROP POLICY IF EXISTS "Public can view approved listings" ON listings;

CREATE POLICY "Public can view all listings"
  ON listings
  FOR SELECT
  TO anon
  USING (true);
