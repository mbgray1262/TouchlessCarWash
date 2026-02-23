/*
  # Create listing_edits table

  ## Summary
  Stores user-submitted "Suggest an Edit" reports for individual car wash listings.
  No authentication is required to submit — this is intentionally public to gather
  crowdsourced corrections.

  ## New Tables
  - `listing_edits`
    - `id` (uuid, PK) — unique identifier
    - `listing_id` (uuid, FK → listings.id) — which listing the edit is about
    - `issue_type` (text, NOT NULL) — one of: 'permanently_closed', 'not_touchless',
      'wrong_address', 'wrong_phone', 'wrong_hours', 'wrong_website', 'other'
    - `details` (text) — optional free-text from user
    - `email` (text) — optional contact email for follow-up
    - `status` (text, DEFAULT 'pending') — 'pending' | 'approved' | 'dismissed'
    - `ip_address` (text) — stored for rate-limiting (3 per IP per day), never surfaced in UI
    - `created_at` (timestamptz) — submission timestamp
    - `reviewed_at` (timestamptz) — when admin actioned the edit

  ## Security
  - RLS enabled
  - Anonymous INSERT allowed (needed for public submissions)
  - Only service role / admin can SELECT, UPDATE
  - Public cannot read other users' submissions
*/

CREATE TABLE IF NOT EXISTS listing_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  issue_type text NOT NULL CHECK (issue_type IN (
    'permanently_closed',
    'not_touchless',
    'wrong_address',
    'wrong_phone',
    'wrong_hours',
    'wrong_website',
    'other'
  )),
  details text,
  email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

ALTER TABLE listing_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a listing edit"
  ON listing_edits
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Service role can select listing edits"
  ON listing_edits
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can update listing edits"
  ON listing_edits
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_listing_edits_listing_id ON listing_edits(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_edits_status ON listing_edits(status);
CREATE INDEX IF NOT EXISTS idx_listing_edits_ip_created ON listing_edits(ip_address, created_at);
