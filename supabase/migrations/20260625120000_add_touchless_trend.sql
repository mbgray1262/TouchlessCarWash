-- Touchless Satisfaction Score — "Improving lately" trend signal.
--
-- A nullable text flag computed alongside the score by
-- scripts/score-touchless-satisfaction.mjs. Currently only ever set to
-- 'improving' (positive-only reward badge — we never publicly label a wash as
-- declining). NULL = no improving signal (steady / declining / not enough
-- recent-vs-older touchless reviews to tell).
--
-- "improving" requires, on TOUCHLESS-specific review sentiment:
--   * >= 4 pos/neg mentions in BOTH the recent window (<= 24 months) and the older window
--   * recent positive-rate at least 20 points HIGHER than the older positive-rate
--   * recent positive-rate >= 60%  (so the badge means "now genuinely good AND better than before",
--     never "less bad than it used to be")
ALTER TABLE listings ADD COLUMN IF NOT EXISTS touchless_trend text;

COMMENT ON COLUMN listings.touchless_trend IS
  'TSS momentum signal. ''improving'' = touchless reviews got meaningfully more positive recently AND the wash is now genuinely good (see scripts/score-touchless-satisfaction.mjs). NULL otherwise. Positive-only by design.';
