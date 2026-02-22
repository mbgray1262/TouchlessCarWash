/*
  # Remove touchless filter and fix filter counts to touchless-only listings

  1. Changes
    - Delete the 'touchless' filter and all its listing_filters associations (touchless is implicit in this directory)
    - Create/replace get_filter_counts RPC to count only listings where is_touchless = true
*/

DELETE FROM listing_filters
WHERE filter_id = (SELECT id FROM filters WHERE slug = 'touchless');

DELETE FROM filters WHERE slug = 'touchless';

CREATE OR REPLACE FUNCTION get_filter_counts()
RETURNS TABLE(
  id int,
  name text,
  slug text,
  category text,
  icon text,
  sort_order int,
  count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    f.id,
    f.name,
    f.slug,
    f.category,
    f.icon,
    f.sort_order,
    COUNT(lf.listing_id) AS count
  FROM filters f
  LEFT JOIN listing_filters lf ON lf.filter_id = f.id
  LEFT JOIN listings l ON l.id = lf.listing_id AND l.is_touchless = true
  GROUP BY f.id, f.name, f.slug, f.category, f.icon, f.sort_order
  ORDER BY f.sort_order;
$$;
