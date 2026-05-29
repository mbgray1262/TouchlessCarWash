/*
  # listing_completeness_stats() — accurate "missing image" count

  The first version counted hero_image IS NULL, which badly overcounted: the
  listing card and detail page both fall back through a chain of images:

      chain brand image  ??  hero_image  ??  google_photo_url  ??  street_view_url

  So a listing with a null hero_image usually still DISPLAYS an image (a chain
  brand image for verified-chain locations, a Google photo, or a street view).

  This redefines "missing image" to mean a listing that truly shows nothing:
    - hero_image IS NULL, AND
    - google_photo_url IS NULL, AND
    - street_view_url IS NULL, AND
    - it is not a verified chain (chain locations get a brand image fallback
      from lib/chain-brand-images.ts, which lives in code, not the DB).

  Everything else is unchanged from 20260529000000.
*/

CREATE OR REPLACE FUNCTION listing_completeness_stats()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH t AS (
    SELECT
      l.id,
      (l.description IS NULL OR l.description = '')                       AS no_description,
      (
        l.hero_image IS NULL
        AND l.google_photo_url IS NULL
        AND l.street_view_url IS NULL
        AND l.touchless_verified IS DISTINCT FROM 'chain'
      )                                                                  AS no_image,
      (l.amenities IS NULL OR cardinality(l.amenities) = 0)              AS no_amenities,
      (l.hours IS NULL)                                                  AS no_hours,
      (l.google_maps_url IS NULL OR l.google_maps_url = '')              AS no_maps_url,
      NOT EXISTS (SELECT 1 FROM review_snippets rs WHERE rs.listing_id = l.id) AS no_reviews
    FROM listings l
    WHERE l.is_touchless = true
  )
  SELECT json_build_object(
    'total',               COUNT(*),
    'missing_description', COUNT(*) FILTER (WHERE no_description),
    'missing_hero',        COUNT(*) FILTER (WHERE no_image),
    'missing_amenities',   COUNT(*) FILTER (WHERE no_amenities),
    'missing_hours',       COUNT(*) FILTER (WHERE no_hours),
    'missing_maps_url',    COUNT(*) FILTER (WHERE no_maps_url),
    'missing_reviews',     COUNT(*) FILTER (WHERE no_reviews),
    'incomplete',          COUNT(*) FILTER (
      WHERE no_description OR no_image OR no_amenities OR no_hours OR no_maps_url OR no_reviews
    )
  )
  FROM t;
$$;

GRANT EXECUTE ON FUNCTION listing_completeness_stats() TO anon, authenticated;
