/*
  # Deduplicate listing photos arrays

  Two enrichment pipelines ran on the same listings:
  gallery-backfill (gallery_bp_ files) and photo-enrich (place_photo_ and photo_N_ files)
  both downloaded the same Google Place images under different filenames.

  This migration:
  1. Removes hero_image from photos array (stored separately, causes duplicate display)
  2. Removes raw external lh3.googleusercontent.com URLs (should be rehosted)
  3. For listings with mixed gallery_bp_ and place_photo_/photo_N_ files, keeps only gallery_bp_
*/

UPDATE listings
SET photos = (
  SELECT COALESCE(array_agg(p ORDER BY idx), ARRAY[]::text[])
  FROM (
    SELECT p, row_number() OVER () AS idx
    FROM unnest(photos) AS p
    WHERE
      p IS DISTINCT FROM hero_image
      AND p NOT LIKE '%lh3.googleusercontent.com%'
      AND p NOT LIKE '%maps.googleapis.com%'
  ) sub
)
WHERE array_length(photos, 1) > 0;

UPDATE listings
SET photos = (
  SELECT COALESCE(array_agg(p ORDER BY idx), ARRAY[]::text[])
  FROM (
    SELECT p, row_number() OVER () AS idx
    FROM unnest(photos) AS p
  ) sub
  WHERE
    CASE
      WHEN EXISTS (
        SELECT 1 FROM unnest(photos) AS q
        WHERE q LIKE '%/gallery_bp_%'
      )
      THEN p LIKE '%/gallery_bp_%'
      ELSE true
    END
)
WHERE
  array_length(photos, 1) > 0
  AND photos::text LIKE '%gallery_bp_%'
  AND (
    photos::text LIKE '%/place_photo_%'
    OR photos::text ~ '/photo_[0-9]+_[0-9]+'
  );
