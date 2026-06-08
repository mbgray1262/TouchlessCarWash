-- FREEZE the 2026 Best-Of trophy list.
--
-- Once we email a business "you won #1 Best Touchless in <city>" and they embed
-- a badge, that win must NOT be silently revoked by a later recompute bumping
-- them down or off the list. This trigger makes best_of_rankings effectively
-- read-only: any INSERT/UPDATE/DELETE raises an error.
--
-- To DELIBERATELY recompute (e.g. a reviewed annual refresh):
--   1. ALTER TABLE best_of_rankings DISABLE TRIGGER freeze_best_of_rankings;
--   2. node --experimental-strip-types scripts/populate-best-of-rankings.mts
--   3. ALTER TABLE best_of_rankings ENABLE TRIGGER freeze_best_of_rankings;
-- (or DROP/RE-CREATE the trigger). This forces a human, reviewed decision —
-- there is no automated path that can change the winners.

CREATE OR REPLACE FUNCTION prevent_best_of_rankings_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'best_of_rankings is FROZEN for 2026. Trophies cannot change automatically. '
    'To recompute deliberately, DISABLE TRIGGER freeze_best_of_rankings, run '
    'scripts/populate-best-of-rankings.mts, then ENABLE it again.';
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS freeze_best_of_rankings ON best_of_rankings;
CREATE TRIGGER freeze_best_of_rankings
  BEFORE INSERT OR UPDATE OR DELETE ON best_of_rankings
  FOR EACH ROW
  EXECUTE FUNCTION prevent_best_of_rankings_write();
