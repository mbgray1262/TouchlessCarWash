-- Update get_photo_audit_page to support unreviewed_only filter
CREATE OR REPLACE FUNCTION get_photo_audit_page(
  p_filter text DEFAULT 'all',
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 25,
  p_unreviewed_only boolean DEFAULT false
)
RETURNS json
LANGUAGE sql
STABLE
AS $$
  WITH latest_per_listing AS (
    SELECT DISTINCT ON (par.listing_id)
      par.id,
      par.listing_id,
      par.equipment_brand,
      par.equipment_model,
      par.equipment_confidence,
      par.equipment_source_photo,
      par.hero_quality,
      par.suggested_hero_url,
      par.suggested_hero_reason,
      par.photos_to_remove,
      par.reviewed,
      par.applied,
      par.google_photos_added,
      par.google_photos_screened,
      par.created_at,
      l.name AS listing_name,
      l.hero_image AS listing_hero,
      l.city AS listing_city,
      l.state AS listing_state,
      l.slug AS listing_slug,
      l.reviewed_at AS listing_reviewed_at
    FROM photo_audit_results par
    JOIN listings l ON l.id = par.listing_id AND l.is_touchless IS DISTINCT FROM false
    ORDER BY par.listing_id, par.created_at DESC
  ),
  filtered AS (
    SELECT *
    FROM latest_per_listing
    WHERE
      CASE p_filter
        WHEN 'review' THEN
          (equipment_brand IS NOT NULL AND NOT applied AND NOT reviewed) OR
          (hero_quality = 'poor' AND suggested_hero_url IS NOT NULL AND NOT applied) OR
          (array_length(photos_to_remove, 1) > 0 AND NOT applied)
        WHEN 'equipment' THEN equipment_brand IS NOT NULL
        WHEN 'heroes' THEN hero_quality = 'poor' AND suggested_hero_url IS NOT NULL
        WHEN 'cleanup' THEN array_length(photos_to_remove, 1) > 0
        ELSE true
      END
      AND (NOT p_unreviewed_only OR listing_reviewed_at IS NULL)
  ),
  total_count AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT json_build_object(
    'total', (SELECT cnt FROM total_count),
    'results', COALESCE(
      (SELECT json_agg(row_to_json(f))
       FROM (SELECT * FROM filtered ORDER BY created_at DESC LIMIT p_limit OFFSET p_offset) f),
      '[]'::json
    )
  );
$$;
