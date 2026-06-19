-- Deliberate 2026 Best-Of recompute (no owners notified yet): temporarily lift
-- the freeze so populate-best-of-rankings.mts can refresh winners against the
-- post-cleanup data. Re-enabled immediately after by 20260619180100.
ALTER TABLE best_of_rankings DISABLE TRIGGER freeze_best_of_rankings;
