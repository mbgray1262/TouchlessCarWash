/*
  # listing_completeness_stats()

  Powers the admin dashboard "Listing Completeness" card. Reports, for the
  universe of touchless listings, how many are missing each component that a
  fully-complete listing should have:

    - description       (AI marketing description)
    - hero_image        (lead photo)
    - amenities         (non-empty text[] array)
    - hours             (opening hours jsonb)
    - google_maps_url   (link to the Google Maps place)
    - reviews           (>= 1 row in review_snippets)

  "incomplete" counts a listing if it is missing ANY of the above.

  All of these gaps are fixable for free by the enrich-listings pipeline
  (google-enrich fills hours/maps_url/reviews/photos from Google Place Details
  within the Maps free tier; generate-descriptions fills the description;
  backfill-amenities fills amenities; street-view provides a hero fallback).

  Modeled on admin_listing_stats(): a single SECURITY DEFINER SQL function so
  the cross-table review count is computed server-side in one round trip,
  avoiding the PostgREST 1000-row select cap.
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
      (l.hero_image IS NULL OR l.hero_image = '')                        AS no_hero,
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
    'missing_hero',        COUNT(*) FILTER (WHERE no_hero),
    'missing_amenities',   COUNT(*) FILTER (WHERE no_amenities),
    'missing_hours',       COUNT(*) FILTER (WHERE no_hours),
    'missing_maps_url',    COUNT(*) FILTER (WHERE no_maps_url),
    'missing_reviews',     COUNT(*) FILTER (WHERE no_reviews),
    'incomplete',          COUNT(*) FILTER (
      WHERE no_description OR no_hero OR no_amenities OR no_hours OR no_maps_url OR no_reviews
    )
  )
  FROM t;
$$;

GRANT EXECUTE ON FUNCTION listing_completeness_stats() TO anon, authenticated;
