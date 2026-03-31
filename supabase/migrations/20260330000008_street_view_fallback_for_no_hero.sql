-- Assign street_view_url as hero_image for touchless listings that have no hero image.
--
-- We cleared gps-cs-s URLs (migration 0007) and chain_brand hero images (0006),
-- leaving ~800 listings with null hero_image. While the photo-enrich pipeline
-- processes the backlog (50 at a time via watchdog), listings with a street_view_url
-- should immediately show something rather than a blank image.
--
-- Street view is a real, permanent Google Static Maps URL and is a valid fallback.
-- Photo-enrich will later upgrade these to a proper car wash facility photo.

UPDATE listings
SET
  hero_image        = street_view_url,
  hero_image_source = 'street_view'
WHERE is_touchless = true
  AND hero_image IS NULL
  AND street_view_url IS NOT NULL
  AND hero_image_source IS DISTINCT FROM 'chain_brand';

DO $$
DECLARE cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM listings
  WHERE is_touchless = true
    AND hero_image_source = 'street_view'
    AND hero_image IS NOT NULL;
  RAISE NOTICE 'Assigned street_view_url as hero_image for listings now using street view fallback: total street_view heroes = %', cnt;
END $$;
