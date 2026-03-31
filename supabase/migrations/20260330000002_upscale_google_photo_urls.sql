-- Upscale low-res Google Photos URLs to w1600-h1200.
--
-- DataForSEO returns main_image URLs with small size suffixes (e.g. =w400-h300).
-- Google Photos URLs support any resolution by changing the trailing =w<N>-h<N> param.
-- This migration replaces the suffix with =w1600-h1200 on hero_image and google_photo_url.
-- Manually approved photos (hero_image_source='manual') are also upscaled since
-- quality improvement is always desirable regardless of approval state.

-- hero_image: upscale googleusercontent.com URLs
UPDATE listings
SET hero_image = regexp_replace(hero_image, '=[^/=]+$', '=w1600-h1200')
WHERE hero_image ILIKE '%googleusercontent.com%'
  AND hero_image ~ '=[^/=]+$';

-- google_photo_url: upscale googleusercontent.com URLs
UPDATE listings
SET google_photo_url = regexp_replace(google_photo_url, '=[^/=]+$', '=w1600-h1200')
WHERE google_photo_url ILIKE '%googleusercontent.com%'
  AND google_photo_url ~ '=[^/=]+$';

-- Report
DO $$
DECLARE
  hero_cnt integer;
  gphoto_cnt integer;
BEGIN
  SELECT COUNT(*) INTO hero_cnt FROM listings
  WHERE hero_image ILIKE '%googleusercontent.com%'
    AND hero_image LIKE '%=w1600-h1200';
  SELECT COUNT(*) INTO gphoto_cnt FROM listings
  WHERE google_photo_url ILIKE '%googleusercontent.com%'
    AND google_photo_url LIKE '%=w1600-h1200';
  RAISE NOTICE 'Upscaled: % hero_image URLs, % google_photo_url URLs now at w1600-h1200', hero_cnt, gphoto_cnt;
END $$;
