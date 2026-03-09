-- Replace the complex sentiment columns with a simple touchless_sentiment enum.
-- We only need positive/negative/neutral for the touchless experience,
-- not a numerical score or theme breakdown.

-- Add new simple column
ALTER TABLE listings ADD COLUMN IF NOT EXISTS touchless_sentiment text
  CHECK (touchless_sentiment IN ('positive', 'negative', 'neutral'));

-- Drop unused complex sentiment columns
ALTER TABLE listings DROP COLUMN IF EXISTS sentiment_score;
ALTER TABLE listings DROP COLUMN IF EXISTS sentiment_themes;
ALTER TABLE listings DROP COLUMN IF EXISTS sentiment_summary;
ALTER TABLE listings DROP COLUMN IF EXISTS sentiment_analyzed_at;

-- Drop old backfill index
DROP INDEX IF EXISTS idx_listings_sentiment_backfill;

-- Index for backfill: touchless listings without sentiment yet
CREATE INDEX IF NOT EXISTS idx_listings_touchless_no_sentiment
  ON listings (id)
  WHERE is_touchless = true AND touchless_sentiment IS NULL;
