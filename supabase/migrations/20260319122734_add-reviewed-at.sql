-- Add reviewed_at timestamp to listings table for tracking photo audit approvals
ALTER TABLE listings ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Index for filtering unreviewed listings efficiently
CREATE INDEX IF NOT EXISTS idx_listings_reviewed_at ON listings (reviewed_at) WHERE reviewed_at IS NULL;
