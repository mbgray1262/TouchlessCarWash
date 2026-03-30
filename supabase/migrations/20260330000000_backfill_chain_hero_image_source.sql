-- Backfill hero_image_source for chain listings.
--
-- Chain listings (touchless_verified='chain') that haven't been manually
-- photo-audited get hero_image_source='chain_brand', signaling the render
-- layer to use the brand-level photo instead of a location-specific one
-- (which is typically a gas station forecourt shot, not the car wash).
--
-- Manually approved photos (hero_image_source='manual') are never touched.

UPDATE listings
SET hero_image_source = 'chain_brand'
WHERE touchless_verified = 'chain'
  AND (hero_image_source IS NULL OR hero_image_source != 'manual');

-- Report
DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt FROM listings
  WHERE touchless_verified = 'chain' AND hero_image_source = 'chain_brand';
  RAISE NOTICE 'Backfill complete: % chain listings now use brand photo', cnt;
END $$;
