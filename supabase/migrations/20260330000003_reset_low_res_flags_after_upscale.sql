-- Reset hero_is_low_res flags for listings whose Google Photos URL was just upscaled.
--
-- The photo audit scan flagged these as low-res when URLs had small size params
-- (e.g. =w400-h300). Now that hero_image uses =w1600-h1200, those same photos
-- will load at full resolution on re-scan, so we null out the flag to force a
-- fresh check on the next scan.

UPDATE listings
SET hero_is_low_res = NULL
WHERE hero_is_low_res = TRUE
  AND hero_image ILIKE '%googleusercontent.com%';

-- Report
DO $$
DECLARE cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt FROM listings WHERE hero_is_low_res IS NULL AND hero_image ILIKE '%googleusercontent.com%';
  RAISE NOTICE 'Reset hero_is_low_res for % Google Photos listings (will re-scan fresh)', cnt;
END $$;
