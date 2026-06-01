-- Equipment videos: the pool of touchless-wash clips shown in the
-- "See a Touchless Wash in Action" section on listing pages.
-- Managed from /admin/videos. Each listing deterministically shows one
-- active video (hashed by listing id), so the same listing always shows
-- the same clip. Previously these were hardcoded in components/TouchlessVideo.tsx.
CREATE TABLE IF NOT EXISTS equipment_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_id text NOT NULL UNIQUE,   -- 11-char YouTube video id
  title text NOT NULL,               -- short label shown as the iframe title / alt text
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,  -- only active videos are shown to users
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_videos_active
  ON equipment_videos(is_active, sort_order);

-- RLS: public can read (titles/ids are not sensitive); the public site filters
-- to is_active=true in its query. All writes go through service-role API routes.
ALTER TABLE equipment_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to equipment videos"
  ON equipment_videos FOR SELECT
  USING (true);

CREATE POLICY "Allow service role full access to equipment videos"
  ON equipment_videos FOR ALL
  USING (auth.role() = 'service_role');

-- Seed with the current curated pool (the most common US in-bay touchless
-- systems actually washing cars: PDQ LaserWash 360 + WashWorld Razor).
INSERT INTO equipment_videos (youtube_id, title, sort_order) VALUES
  ('uOreLJusX1U', 'PDQ LaserWash 360 Plus — full touchless wash', 1),
  ('z7OvJIWFtGo', 'PDQ LaserWash 360 Plus touchless wash', 2),
  ('O4frXLZWzRw', 'PDQ LaserWash 360 Plus touchless system', 3),
  ('X6Ms4mlCOPc', 'WashWorld Razor EDGE touchless wash', 4),
  ('S-yXmRv69do', 'WashWorld Razor touchless wash', 5),
  ('QzVYH0V__U0', 'WashWorld Razor HyperForce touchless wash', 6)
ON CONFLICT (youtube_id) DO NOTHING;

COMMENT ON TABLE equipment_videos IS 'Pool of touchless-wash YouTube clips shown on listing pages; managed at /admin/videos';
