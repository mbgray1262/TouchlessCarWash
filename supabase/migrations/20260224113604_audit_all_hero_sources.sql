/*
  # Fix get_unaudited_hero_listings to audit ALL hero image sources

  Previously this RPC only fetched listings where hero_image_source = 'google' or NULL.
  This meant 1,001 listings with street_view, website, and gallery hero images were
  never audited and bad images (brush photos, logos, coin machines, interior shots, etc.)
  remained visible.

  This migration replaces the RPC to audit ALL sources regardless of origin.
*/

CREATE OR REPLACE FUNCTION get_unaudited_hero_listings(p_limit int DEFAULT NULL)
RETURNS TABLE(id uuid, name text, hero_image text)
LANGUAGE sql
STABLE
AS $$
  SELECT l.id, l.name, l.hero_image
  FROM listings l
  WHERE l.is_touchless = true
  AND l.hero_image IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM hero_audit_tasks hat WHERE hat.listing_id = l.id
  )
  ORDER BY l.id
  LIMIT p_limit;
$$;
