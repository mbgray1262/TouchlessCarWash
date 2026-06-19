-- Re-freeze best_of_rankings after the deliberate 2026 recompute
-- (20260619180000). Winners are locked again; future changes require the same
-- disable -> recompute -> enable sequence.
ALTER TABLE best_of_rankings ENABLE TRIGGER freeze_best_of_rankings;
