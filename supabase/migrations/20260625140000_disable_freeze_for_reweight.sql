-- DELIBERATE 2026 Best-Of recompute (reviewed): lift the freeze so the rankings
-- can be rebuilt against the TSS-DOMINANT scoring re-weight (lib/metro-scoring.ts,
-- 2026-06-25). The previous weights let the Paint-Safe verified badge + raw
-- review volume override a clearly-higher Touchless Satisfaction Score, so an
-- "Excellent" wash could rank below a "Good" one. Re-frozen immediately after by
-- 20260625140100. All 62 emailed award winners verified to keep their rank
-- before applying (no emailed trophy is revoked).
ALTER TABLE best_of_rankings DISABLE TRIGGER freeze_best_of_rankings;
