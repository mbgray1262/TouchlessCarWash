-- Re-freeze best_of_rankings after the deliberate 2026 TSS-dominant re-weight
-- recompute (20260625140000). Winners are locked again for the rest of 2026;
-- future changes require the same disable -> recompute -> enable sequence.
ALTER TABLE best_of_rankings ENABLE TRIGGER freeze_best_of_rankings;
