-- Create table for storing review snippets (especially touchless evidence)
CREATE TABLE IF NOT EXISTS review_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reviewer_name text,
  rating integer,
  review_text text NOT NULL,
  review_date text,           -- "2 months ago" etc from SerpAPI
  iso_date date,              -- Parsed date from SerpAPI
  review_id text UNIQUE,      -- SerpAPI review_id for dedup
  touchless_keywords text[],  -- Which keywords matched: {'touchless','no brush',...}
  is_touchless_evidence boolean DEFAULT false,
  source text DEFAULT 'serpapi',
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups by listing
CREATE INDEX IF NOT EXISTS idx_review_snippets_listing_id ON review_snippets(listing_id);
CREATE INDEX IF NOT EXISTS idx_review_snippets_touchless ON review_snippets(is_touchless_evidence) WHERE is_touchless_evidence = true;

-- Add review extraction status to listings table
ALTER TABLE listings ADD COLUMN IF NOT EXISTS review_extract_status text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS touchless_review_count integer DEFAULT 0;

-- RLS: allow public read access to review snippets
ALTER TABLE review_snippets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access to review snippets"
  ON review_snippets FOR SELECT
  USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access to review snippets"
  ON review_snippets FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE review_snippets IS 'Google review snippets mentioning touchless/brushless/etc, extracted via SerpAPI';
COMMENT ON COLUMN review_snippets.touchless_keywords IS 'Array of touchless-related keywords found in this review';
COMMENT ON COLUMN listings.review_extract_status IS 'Status: null=not started, extracted=done with evidence, no_evidence=done but no touchless mentions, failed=error';
COMMENT ON COLUMN listings.touchless_review_count IS 'Count of reviews containing touchless-related keywords';
