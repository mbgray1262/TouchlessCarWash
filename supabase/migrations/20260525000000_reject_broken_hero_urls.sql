-- Guard against bad hero_image URLs being saved by ANY code path.
--
-- We've been bitten three times by enrichment functions writing junk heroes:
--   1) places.googleapis.com photo URLs that expire (404 over time)
--   2) Site placeholder /images/card-fallback.svg accidentally saved as hero
--   3) Vendor websites scraped via firecrawl, returning the same "Main store
--      image" / hiring banner for every location of a chain
--
-- This trigger silently NULLs hero_image when the URL matches a known-bad
-- pattern. Callers don't error; the public site falls back through the chain
-- (chainBrandImage > hero_image > google_photo_url > street_view_url) so the
-- listing remains visually complete.
--
-- Patterns enforced:
--   - places.googleapis.com (expiring Google Places photo refs)
--   - /images/card-fallback.svg (site placeholder)
--   - img.youtube.com/vi/.../maxresdefault.jpg (YouTube thumbnails)

CREATE OR REPLACE FUNCTION reject_broken_hero_url()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.hero_image IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.hero_image LIKE '%places.googleapis.com%'
     OR NEW.hero_image = '/images/card-fallback.svg'
     OR (NEW.hero_image LIKE '%img.youtube.com/vi/%' AND NEW.hero_image LIKE '%/maxresdefault.jpg')
  THEN
    NEW.hero_image := NULL;
    NEW.hero_image_source := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reject_broken_hero_url ON listings;

CREATE TRIGGER trg_reject_broken_hero_url
  BEFORE INSERT OR UPDATE OF hero_image ON listings
  FOR EACH ROW
  EXECUTE FUNCTION reject_broken_hero_url();

COMMENT ON FUNCTION reject_broken_hero_url IS
  'Silently NULLs hero_image when a known-bad URL pattern is written. See scripts/fix-broken-heroes-global.mjs for the cleanup script that matches the same patterns.';
