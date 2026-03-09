-- Add sentiment analysis columns to listings table.
-- These store AI-generated quality insights from customer reviews.

ALTER TABLE listings ADD COLUMN IF NOT EXISTS sentiment_score numeric(3,2);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS sentiment_themes jsonb;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS sentiment_summary text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS sentiment_analyzed_at timestamptz;

-- Fast lookup for touchless listings that haven't been sentiment-analyzed yet (backfill).
CREATE INDEX IF NOT EXISTS idx_listings_sentiment_backfill
  ON listings (sentiment_analyzed_at)
  WHERE is_touchless = true AND sentiment_analyzed_at IS NULL;
