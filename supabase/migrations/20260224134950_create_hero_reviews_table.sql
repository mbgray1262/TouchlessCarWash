/*
  # Create hero_reviews table

  ## Purpose
  Audit trail for manual hero image replacements and flags made in the hero review admin tool.

  ## New Tables

  ### hero_reviews
  - `id` (uuid, primary key)
  - `listing_id` (uuid, FK to listings) — which listing was reviewed
  - `action` (text) — 'replaced' or 'flagged'
  - `old_hero_url` (text, nullable) — the URL of the hero image before the change
  - `new_hero_url` (text, nullable) — the URL of the new hero image (null if flagged)
  - `new_source` (text, nullable) — source label of the new hero (gallery/google/street_view/website/fallback)
  - `created_at` (timestamptz) — when the action was taken

  ## Security
  - RLS enabled
  - Anon can insert (admin tool uses anon key)
  - Anon can select all rows (admin-only table, no sensitive user data)
*/

CREATE TABLE IF NOT EXISTS hero_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('replaced', 'flagged')),
  old_hero_url text,
  new_hero_url text,
  new_source text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS hero_reviews_listing_id_idx ON hero_reviews(listing_id);
CREATE INDEX IF NOT EXISTS hero_reviews_created_at_idx ON hero_reviews(created_at DESC);

ALTER TABLE hero_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can insert hero reviews"
  ON hero_reviews FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can select hero reviews"
  ON hero_reviews FOR SELECT
  TO anon
  USING (true);
