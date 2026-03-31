-- Exclude chain_brand listings from the Low Res tab.
--
-- Chain listings with hero_image_source='chain_brand' display the brand-level
-- photo from the CHAIN_BRAND_IMAGES config — the hero_image field is irrelevant
-- (it's just the low-res DataForSEO thumbnail). No point auditing or showing it.

-- 1. Clear any existing low-res flags on chain_brand listings
UPDATE listings
SET hero_is_low_res = NULL
WHERE hero_image_source = 'chain_brand'
  AND hero_is_low_res IS NOT NULL;

-- 2. Replace get_low_res_listings RPC to exclude chain_brand listings
DROP FUNCTION IF EXISTS get_low_res_listings(integer, integer);
CREATE OR REPLACE FUNCTION get_low_res_listings(p_offset integer, p_limit integer)
RETURNS json AS $$
DECLARE
  total_count integer;
  results json;
BEGIN
  SELECT COUNT(*) INTO total_count
  FROM listings
  WHERE is_touchless = true
    AND hero_is_low_res = true
    AND (hero_image_source IS DISTINCT FROM 'chain_brand');

  SELECT json_agg(row_to_json(t)) INTO results
  FROM (
    SELECT id, name, slug, city, state, hero_image, hero_image_source
    FROM listings
    WHERE is_touchless = true
      AND hero_is_low_res = true
      AND (hero_image_source IS DISTINCT FROM 'chain_brand')
    ORDER BY state, city, name
    LIMIT p_limit OFFSET p_offset
  ) t;

  RETURN json_build_object('total', total_count, 'results', COALESCE(results, '[]'::json));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Report
DO $$
DECLARE cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt FROM listings
  WHERE is_touchless = true AND hero_is_low_res = true
    AND (hero_image_source IS DISTINCT FROM 'chain_brand');
  RAISE NOTICE 'Low Res tab will now show % listings (chain_brand excluded)', cnt;
END $$;
