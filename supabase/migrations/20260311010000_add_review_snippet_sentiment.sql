-- Add per-review sentiment column to review_snippets
-- Values: 'positive', 'negative', 'neutral'
ALTER TABLE review_snippets ADD COLUMN IF NOT EXISTS sentiment text;
