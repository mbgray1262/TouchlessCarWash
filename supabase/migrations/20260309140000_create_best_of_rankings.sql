-- Pre-computed "Best Of" rankings for top 3 listings per metro area.
-- Used to enhance listing page meta titles, descriptions, and schema.org data.
-- Refreshed daily by the compute-rankings edge function.

CREATE TABLE IF NOT EXISTS best_of_rankings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  metro_slug text NOT NULL,
  metro_name text NOT NULL,
  rank smallint NOT NULL CHECK (rank BETWEEN 1 AND 3),
  score numeric(5,1) NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (listing_id, metro_slug)
);

-- Fast lookup by listing (used on listing detail pages)
CREATE INDEX IF NOT EXISTS idx_best_of_rankings_listing_id
  ON best_of_rankings (listing_id);

-- Fast lookup by metro (used when refreshing a metro's rankings)
CREATE INDEX IF NOT EXISTS idx_best_of_rankings_metro_slug
  ON best_of_rankings (metro_slug);

-- RLS: allow anonymous reads
ALTER TABLE best_of_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read access"
  ON best_of_rankings
  FOR SELECT
  TO anon
  USING (true);

-- Service role needs full access for the edge function to upsert/delete
CREATE POLICY "Allow service role full access"
  ON best_of_rankings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
