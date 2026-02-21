/*
  # Filters Schema, Seed Data, and Initial Population

  ## Summary
  Creates a relational filter system for the car wash directory search.

  ## New Tables

  ### `filters`
  Reference table of all available search filters.
  - `id` (serial PK)
  - `name` (text) — display name
  - `slug` (text, unique) — URL-safe identifier
  - `category` (text) — 'feature' or 'amenity'
  - `icon` (text) — Lucide icon name for frontend
  - `sort_order` (int) — display order
  - `created_at` (timestamptz)

  ### `listing_filters`
  Junction table linking listings to their applicable filters.
  - `listing_id` (uuid FK → listings)
  - `filter_id` (int FK → filters)
  - Composite PK on (listing_id, filter_id)
  - Indexes in both directions for fast lookups

  ## Seeded Filters
  1. Touchless
  2. Open 24 Hours
  3. Free Vacuum
  4. Unlimited Wash Club
  5. Self-Serve Bays
  6. RV / Oversized

  ## Initial Population
  1. Touchless filter — from listings.is_touchless = true
  2. Open 24 Hours filter — listings where all 7 days = 'Open 24 hours'
  3. Free Vacuum — from google_about data
  4. Unlimited Wash Club — from google_about membership data

  ## Security
  - RLS enabled on both tables
  - Anon can read (needed for frontend filter queries)
  - Anon can insert into listing_filters (needed for pipeline sync)
*/

-- Create filters reference table
CREATE TABLE IF NOT EXISTS filters (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'feature',
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read filters"
  ON filters FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can insert filters"
  ON filters FOR INSERT
  TO anon
  WITH CHECK (true);

-- Create listing_filters junction table
CREATE TABLE IF NOT EXISTS listing_filters (
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  filter_id INT NOT NULL REFERENCES filters(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, filter_id)
);

CREATE INDEX IF NOT EXISTS idx_listing_filters_filter ON listing_filters(filter_id);
CREATE INDEX IF NOT EXISTS idx_listing_filters_listing ON listing_filters(listing_id);

ALTER TABLE listing_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read listing_filters"
  ON listing_filters FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert listing_filters"
  ON listing_filters FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can delete listing_filters"
  ON listing_filters FOR DELETE
  TO anon
  USING (true);

-- Seed filter definitions
INSERT INTO filters (name, slug, category, icon, sort_order) VALUES
  ('Touchless',           'touchless',           'feature', 'sparkles',   1),
  ('Open 24 Hours',       'open-24-hours',       'feature', 'clock',      2),
  ('Free Vacuum',         'free-vacuum',         'amenity', 'wind',       3),
  ('Unlimited Wash Club', 'unlimited-wash-club', 'amenity', 'refresh-cw', 4),
  ('Self-Serve Bays',     'self-serve-bays',     'feature', 'hand',       5),
  ('RV / Oversized',      'rv-oversized',        'feature', 'truck',      6)
ON CONFLICT (slug) DO NOTHING;

-- Populate: Touchless filter from is_touchless = true
INSERT INTO listing_filters (listing_id, filter_id)
SELECT l.id, f.id
FROM listings l
CROSS JOIN filters f
WHERE f.slug = 'touchless'
  AND l.is_touchless = true
ON CONFLICT DO NOTHING;

-- Populate: Open 24 Hours from hours JSON (require all 7 days)
INSERT INTO listing_filters (listing_id, filter_id)
SELECT l.id, f.id
FROM listings l
CROSS JOIN filters f
WHERE f.slug = 'open-24-hours'
  AND l.hours IS NOT NULL
  AND l.hours::text != '{}'
  AND l.hours->>'monday'    = 'Open 24 hours'
  AND l.hours->>'tuesday'   = 'Open 24 hours'
  AND l.hours->>'wednesday' = 'Open 24 hours'
  AND l.hours->>'thursday'  = 'Open 24 hours'
  AND l.hours->>'friday'    = 'Open 24 hours'
  AND l.hours->>'saturday'  = 'Open 24 hours'
  AND l.hours->>'sunday'    = 'Open 24 hours'
ON CONFLICT DO NOTHING;

-- Populate: Free Vacuum from google_about
INSERT INTO listing_filters (listing_id, filter_id)
SELECT l.id, f.id
FROM listings l
CROSS JOIN filters f
WHERE f.slug = 'free-vacuum'
  AND l.google_about IS NOT NULL
  AND (
    l.google_about::text LIKE '%"Free vacuums": true%'
    OR l.google_about::text LIKE '%"Car vacuum": true%'
  )
ON CONFLICT DO NOTHING;

-- Populate: Unlimited Wash Club from google_about
INSERT INTO listing_filters (listing_id, filter_id)
SELECT l.id, f.id
FROM listings l
CROSS JOIN filters f
WHERE f.slug = 'unlimited-wash-club'
  AND l.google_about IS NOT NULL
  AND l.google_about::text LIKE '%"Membership": true%'
ON CONFLICT DO NOTHING;
