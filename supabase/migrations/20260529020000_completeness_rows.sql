/*
  # completeness_rows(p_limit, p_ids)

  Row-level companion to listing_completeness_stats(). Powers the admin
  "before / after" view at /admin/completeness.

  - p_ids IS NULL  → return the next p_limit INCOMPLETE touchless listings,
                     ordered so the ones still missing a Google Maps link
                     (and therefore reviews) come first — matching the order
                     the enrich-listings batch picks.
  - p_ids provided → return exactly those listings (used to re-read state
                     after a fix, so the page can diff before vs after).

  Each row carries the same per-component "missing" booleans as the stats
  function, plus name/city/state/slug for display and linking.
*/

CREATE OR REPLACE FUNCTION completeness_rows(
  p_limit int DEFAULT 25,
  p_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  city text,
  state text,
  slug text,
  no_description boolean,
  no_image boolean,
  no_amenities boolean,
  no_hours boolean,
  no_maps_url boolean,
  no_reviews boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    l.id,
    l.name,
    l.city,
    l.state,
    l.slug,
    (l.description IS NULL OR l.description = '')                        AS no_description,
    (
      l.hero_image IS NULL
      AND l.google_photo_url IS NULL
      AND l.street_view_url IS NULL
      AND l.touchless_verified IS DISTINCT FROM 'chain'
    )                                                                   AS no_image,
    (l.amenities IS NULL OR cardinality(l.amenities) = 0)               AS no_amenities,
    (l.hours IS NULL)                                                   AS no_hours,
    (l.google_maps_url IS NULL OR l.google_maps_url = '')               AS no_maps_url,
    NOT EXISTS (SELECT 1 FROM review_snippets rs WHERE rs.listing_id = l.id) AS no_reviews
  FROM listings l
  WHERE l.is_touchless = true
    AND (
      (p_ids IS NOT NULL AND l.id = ANY (p_ids))
      OR (
        p_ids IS NULL AND (
          l.description IS NULL OR l.description = ''
          OR (
            l.hero_image IS NULL
            AND l.google_photo_url IS NULL
            AND l.street_view_url IS NULL
            AND l.touchless_verified IS DISTINCT FROM 'chain'
          )
          OR l.amenities IS NULL OR cardinality(l.amenities) = 0
          OR l.hours IS NULL
          OR l.google_maps_url IS NULL OR l.google_maps_url = ''
          OR NOT EXISTS (SELECT 1 FROM review_snippets rs WHERE rs.listing_id = l.id)
        )
      )
    )
  ORDER BY (l.google_maps_url IS NOT NULL) ASC, l.review_count DESC NULLS LAST
  LIMIT CASE WHEN p_ids IS NULL THEN GREATEST(p_limit, 1) ELSE 1000 END;
$$;

GRANT EXECUTE ON FUNCTION completeness_rows(int, uuid[]) TO anon, authenticated;
