/*
  # Expand hero audit to include null-source hero listings

  ## Summary
  Updates the `get_unaudited_hero_listings` RPC to also return listings where
  `hero_image_source IS NULL` (295 listings from old imports that never went through
  the hero enrichment pipeline), in addition to the existing `hero_image_source = 'google'`
  listings.

  Also updates `count_distinct_audited_hero_listings` — no change needed there as it
  already counts all audited listings regardless of source.

  ## Changes
  - `get_unaudited_hero_listings` — adds `OR hero_image_source IS NULL` to the WHERE clause
*/

CREATE OR REPLACE FUNCTION get_unaudited_hero_listings(p_limit int DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  name text,
  hero_image text
)
LANGUAGE sql
AS $$
  SELECT l.id, l.name, l.hero_image
  FROM listings l
  WHERE l.is_touchless = true
    AND l.hero_image IS NOT NULL
    AND (l.hero_image_source = 'google' OR l.hero_image_source IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM hero_audit_tasks hat WHERE hat.listing_id = l.id
    )
  ORDER BY l.id
  LIMIT p_limit;
$$;
