-- Returns listing counts per state for a given filter slug.
-- Only includes states with 3+ touchless listings having the filter.
CREATE OR REPLACE FUNCTION feature_state_counts(p_filter_slug text)
RETURNS TABLE(state text, count bigint) AS $$
  SELECT l.state, COUNT(DISTINCT l.id)::bigint
  FROM listing_filters lf
  JOIN filters f ON f.id = lf.filter_id
  JOIN listings l ON l.id = lf.listing_id AND l.is_touchless = true
  WHERE f.slug = p_filter_slug
  GROUP BY l.state
  HAVING COUNT(DISTINCT l.id) >= 3
  ORDER BY COUNT(DISTINCT l.id) DESC;
$$ LANGUAGE sql STABLE;

-- Returns national total listing count for a filter slug.
CREATE OR REPLACE FUNCTION feature_total_count(p_filter_slug text)
RETURNS bigint AS $$
  SELECT COUNT(DISTINCT lf.listing_id)::bigint
  FROM listing_filters lf
  JOIN filters f ON f.id = lf.filter_id
  JOIN listings l ON l.id = lf.listing_id AND l.is_touchless = true
  WHERE f.slug = p_filter_slug;
$$ LANGUAGE sql STABLE;
