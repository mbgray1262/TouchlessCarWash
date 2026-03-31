-- Null out expired Google Maps session-token photo URLs (gps-cs-s format).
--
-- DataForSEO returns lh3.googleusercontent.com/gps-cs-s/... URLs which contain
-- short-lived session tokens. These expire within hours/days and show as broken
-- images. They must never be stored as permanent hero_image or google_photo_url.
-- Nulling them forces the photo-enrich pipeline to find a proper permanent photo.

UPDATE listings
SET hero_image = NULL,
    hero_is_low_res = NULL
WHERE hero_image LIKE '%/gps-cs-s/%';

UPDATE listings
SET google_photo_url = NULL
WHERE google_photo_url LIKE '%/gps-cs-s/%';

-- Also clear from photos array
UPDATE listings
SET photos = ARRAY(
  SELECT p FROM unnest(photos) AS p
  WHERE p NOT LIKE '%/gps-cs-s/%'
)
WHERE photos IS NOT NULL
  AND array_to_string(photos, ',') LIKE '%gps-cs-s%';

DO $$
DECLARE hero_cnt integer; photo_cnt integer;
BEGIN
  SELECT COUNT(*) INTO hero_cnt FROM listings WHERE hero_image IS NULL AND hero_is_low_res IS NULL;
  RAISE NOTICE 'Cleared expired gps-cs-s URLs from hero_image and google_photo_url';
END $$;
