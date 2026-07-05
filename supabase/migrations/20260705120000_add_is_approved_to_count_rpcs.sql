/*
  # Add is_approved to the public count RPCs

  ## Summary
  state_listing_counts / feature_state_counts / feature_total_count feed
  public counts (home-page state grid, /states, feature pages, and the
  sitemap's feature-page gating) but counted ALL touchless listings,
  including unapproved ones that 308-redirect when visited. Every other
  public surface now goes through lib/public-listings.ts, which requires
  is_touchless AND is_approved — this brings the SQL side in line so counts
  match the listings actually rendered (~108 unapproved touchless rows were
  being counted at the time of this migration).

  ## Changed Functions (definitions otherwise identical)
  - state_listing_counts(): + AND is_approved = true
  - feature_state_counts(p_filter_slug): + AND l.is_approved = true
  - feature_total_count(p_filter_slug): + AND l.is_approved = true
  - states_with_touchless_listings(): + AND is_approved = true
  - cities_in_state_with_counts(p_state): + AND is_approved = true
  - get_filter_counts(): + is_approved, AND fixes a pre-existing bug where
    COUNT(lf.listing_id) ignored the LEFT-JOIN's is_touchless condition
    entirely (counting non-touchless listings too); now counts l.id so the
    join conditions actually apply.
*/

CREATE OR REPLACE FUNCTION state_listing_counts()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_object_agg(state, cnt)
  FROM (
    SELECT state, COUNT(*) AS cnt
    FROM listings
    WHERE is_touchless = true
      AND is_approved = true
      AND state IS NOT NULL
    GROUP BY state
  ) t;
$$;

CREATE OR REPLACE FUNCTION feature_state_counts(p_filter_slug text)
RETURNS TABLE(state text, count bigint) AS $$
  SELECT l.state, COUNT(DISTINCT l.id)::bigint
  FROM listing_filters lf
  JOIN filters f ON f.id = lf.filter_id
  JOIN listings l ON l.id = lf.listing_id AND l.is_touchless = true AND l.is_approved = true
  WHERE f.slug = p_filter_slug
  GROUP BY l.state
  HAVING COUNT(DISTINCT l.id) >= 3
  ORDER BY COUNT(DISTINCT l.id) DESC;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION feature_total_count(p_filter_slug text)
RETURNS bigint AS $$
  SELECT COUNT(DISTINCT lf.listing_id)::bigint
  FROM listing_filters lf
  JOIN filters f ON f.id = lf.filter_id
  JOIN listings l ON l.id = lf.listing_id AND l.is_touchless = true AND l.is_approved = true
  WHERE f.slug = p_filter_slug;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION states_with_touchless_listings()
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT DISTINCT state
    FROM listings
    WHERE is_touchless = true
      AND is_approved = true
      AND state IS NOT NULL
    ORDER BY state
  );
$$;

CREATE OR REPLACE FUNCTION cities_in_state_with_counts(p_state text)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_agg(row_to_json(t) ORDER BY t.count DESC)
  FROM (
    SELECT city, COUNT(*)::integer AS count
    FROM listings
    WHERE is_touchless = true
      AND is_approved = true
      AND state = p_state
      AND city IS NOT NULL
    GROUP BY city
  ) t;
$$;

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
    COUNT(l.id) AS count
  FROM filters f
  LEFT JOIN listing_filters lf ON lf.filter_id = f.id
  LEFT JOIN listings l ON l.id = lf.listing_id AND l.is_touchless = true AND l.is_approved = true
  GROUP BY f.id, f.name, f.slug, f.category, f.icon, f.sort_order
  ORDER BY f.sort_order;
$$;
