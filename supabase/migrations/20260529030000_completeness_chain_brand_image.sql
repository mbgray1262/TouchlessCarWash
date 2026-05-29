/*
  # Completeness "no image" — account for chain brand images by parent_chain

  The detail page (app/state/[state]/[city]/[slug]/page.tsx) resolves its hero as:

      getChainBrandImage(parent_chain) ?? hero_image ?? google_photo_url ?? street_view_url

  getChainBrandImage is keyed on parent_chain (any chain in lib/chain-brand-images.ts),
  NOT on touchless_verified. So a listing like "Kwik Trip" verified via user_review —
  with all three image columns null — still shows its Kwik Trip brand image and is
  NOT missing an image.

  Previous versions excused only touchless_verified = 'chain', so 300+ chain
  locations (Kwik Trip, Holiday, Super Wash, Power Market, ...) were wrongly flagged
  as "no image". Fix: a listing has no image only when all three image columns are
  null AND it has no parent_chain to fall back to. (Of all parent_chains in this
  state, every one but a single stray has a brand image mapped, so parent_chain
  IS NOT NULL is a faithful proxy for "has a brand image".)

  Updates both listing_completeness_stats() and completeness_rows().
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
        AND l.parent_chain IS NULL
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
      AND l.parent_chain IS NULL
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
            AND l.parent_chain IS NULL
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
