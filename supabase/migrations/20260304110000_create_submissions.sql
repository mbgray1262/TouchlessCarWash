/*
  # Create submissions table for business listing submissions

  ## Summary
  Allows car wash owners to submit their business for review and inclusion
  in the directory. Submissions are reviewed by admin before being added.

  ## New Tables
  - `submissions`
    - Public INSERT via anon role (no auth required)
    - Service role can manage all rows (for admin review)
    - Rate limiting enforced in the API route (3 per IP per day)
*/

CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  zip text NOT NULL,
  phone text,
  website text,
  hours text,
  wash_packages text,
  amenities text,
  submitter_email text,
  ip_address text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can insert submissions"
  ON submissions FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Service role can manage submissions"
  ON submissions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
