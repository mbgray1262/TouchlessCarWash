-- Trigger: reset hero_is_low_res whenever hero_image changes.
--
-- When a listing gets a new hero image (photo-enrich, manual approval, etc.),
-- the old low-res scan result is stale. Set hero_is_low_res = NULL so the
-- listing is re-evaluated on the next scan rather than staying stuck on the
-- Low Res tab forever.

CREATE OR REPLACE FUNCTION reset_hero_is_low_res()
RETURNS TRIGGER AS $$
BEGIN
  -- Only reset when hero_image actually changed to a new non-null value
  IF (NEW.hero_image IS DISTINCT FROM OLD.hero_image) AND NEW.hero_image IS NOT NULL THEN
    NEW.hero_is_low_res = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reset_hero_is_low_res ON listings;

CREATE TRIGGER trg_reset_hero_is_low_res
BEFORE UPDATE ON listings
FOR EACH ROW
EXECUTE FUNCTION reset_hero_is_low_res();
