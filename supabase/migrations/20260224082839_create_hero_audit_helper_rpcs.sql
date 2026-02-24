/*
  # Create helper RPCs for hero audit

  ## Summary
  Adds two helper functions used by the hero-audit edge function:

  1. `get_unaudited_hero_listings(p_limit)` — returns listings with Google hero images
     that have never appeared in any hero_audit_tasks row (true anti-join, not in-memory filter).
     This fixes the bug where the start action only found ~184 listings instead of ~2500.

  2. `count_distinct_audited_hero_listings()` — returns the count of distinct listing_ids
     that have ever been in hero_audit_tasks, used for the status display.
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
    AND l.hero_image_source = 'google'
    AND l.hero_image IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM hero_audit_tasks hat WHERE hat.listing_id = l.id
    )
  ORDER BY l.id
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION count_distinct_audited_hero_listings()
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT count(DISTINCT listing_id) FROM hero_audit_tasks;
$$;
