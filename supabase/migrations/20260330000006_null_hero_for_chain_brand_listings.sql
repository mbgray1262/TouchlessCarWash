-- Null out hero_image for chain_brand listings.
--
-- Chain listings display brand-level photos from CHAIN_BRAND_IMAGES config,
-- not their hero_image field. DataForSEO main_image for gas station chains
-- frequently returns product shots (soda bottles, store interiors, food items)
-- rather than car wash photos. These are never shown publicly but pollute the
-- admin tools and confuse the AI photo screening pipeline.

UPDATE listings
SET hero_image = NULL,
    hero_is_low_res = NULL
WHERE hero_image_source = 'chain_brand'
  AND hero_image IS NOT NULL;

DO $$
DECLARE cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt FROM listings WHERE hero_image_source = 'chain_brand' AND hero_image IS NULL;
  RAISE NOTICE 'Cleared hero_image from % chain_brand listings', cnt;
END $$;
