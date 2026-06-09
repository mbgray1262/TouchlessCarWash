-- Make trophy DISQUALIFICATION automatic and general (no special-casing).
--
-- Rule Michael wants: marking ANY trophy winner Not Touchless (or otherwise
-- demoting it: is_touchless=false / is_approved=false) must remove it from the
-- Best-Of trophy table immediately, everywhere (badges, sibling "more top-ranked"
-- links, admin Best-Of tab). The public /best page already drops + replaces it
-- live (it scores is_touchless+is_approved washes on every render), so the next
-- eligible wash takes its place there automatically.
--
-- This must coexist with the 2026 FREEZE (no automatic score-drift recompute can
-- silently revoke a claimed winner). So the freeze becomes GUC-gated: it blocks
-- ALL writes EXCEPT ones flagged by a sanctioned path (the cascade below, or a
-- deliberate manual recompute that disables the trigger).

-- 1. Freeze, but allow sanctioned writes (app.allow_best_of_write = 'on').
CREATE OR REPLACE FUNCTION prevent_best_of_rankings_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.allow_best_of_write', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD); -- sanctioned (disqualification cascade)
  END IF;
  RAISE EXCEPTION
    'best_of_rankings is FROZEN for 2026. Winners change ONLY via admin '
    'disqualification (auto-cascade) or a DELIBERATE recompute (disable trigger '
    'freeze_best_of_rankings, run scripts/populate-best-of-rankings.mts, re-enable).';
END
$$;

-- 2. Cascade: when a listing stops being touchless+approved, drop its trophies.
--    SECURITY DEFINER so it can write best_of_rankings (RLS = service role only);
--    sets the GUC so the freeze above permits exactly this delete.
CREATE OR REPLACE FUNCTION cascade_remove_demoted_trophy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('app.allow_best_of_write', 'on', true);
  DELETE FROM best_of_rankings WHERE listing_id = NEW.id;
  PERFORM set_config('app.allow_best_of_write', 'off', true);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS remove_demoted_trophy ON listings;
CREATE TRIGGER remove_demoted_trophy
  AFTER UPDATE OF is_touchless, is_approved ON listings
  FOR EACH ROW
  WHEN (NEW.is_touchless IS DISTINCT FROM TRUE OR NEW.is_approved IS DISTINCT FROM TRUE)
  EXECUTE FUNCTION cascade_remove_demoted_trophy();

-- 3. One-time cleanup of trophies already stranded by a demotion that happened
--    before this trigger existed (e.g. the Not-Touchless wash Michael just flagged).
DO $$
BEGIN
  PERFORM set_config('app.allow_best_of_write', 'on', true);
  DELETE FROM best_of_rankings br
  USING listings l
  WHERE br.listing_id = l.id
    AND (l.is_touchless IS DISTINCT FROM TRUE OR l.is_approved IS DISTINCT FROM TRUE);
  PERFORM set_config('app.allow_best_of_write', 'off', true);
END
$$;
