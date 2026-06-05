-- Touchless Satisfaction Score storage.
-- Per-listing score (0–100) + the underlying touchless sentiment counts, computed
-- from review_snippets sentiment (excluding reviews about non-touchless bays).
-- Tier label is derived in code from the score so cutoffs can change without re-scoring.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS touchless_satisfaction_score integer,
  ADD COLUMN IF NOT EXISTS touchless_pos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS touchless_neg integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS touchless_mentions integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tss_scored_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_listings_tss ON listings(touchless_satisfaction_score);

-- Which wash service a touchless-evidence review is actually about
-- (touchless | other_service | unclear) so the evidence drawer can exclude
-- bleed-over from soft-touch/self-serve bays at mixed facilities.
ALTER TABLE review_snippets ADD COLUMN IF NOT EXISTS touchless_about text;
