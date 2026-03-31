-- Clear the UK Shell support page URL from 2 listings.
-- This is a UK help article (en-gb) about Shell service station car washes in the UK,
-- completely wrong for US listings. Most Shell listings already have correct
-- find.shell.com/us/fuel/... location-specific URLs.

UPDATE listings
SET website = NULL
WHERE website = 'https://support.shell.com/hc/en-gb/articles/115005908365-What-car-wash-facilities-do-you-provide-at-Shell-service-stations';

DO $$
DECLARE cnt integer;
BEGIN
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'Cleared UK Shell support URL from % listings', cnt;
END $$;
