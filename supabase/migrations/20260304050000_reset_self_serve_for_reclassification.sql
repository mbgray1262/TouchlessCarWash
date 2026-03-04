/*
  # Reset self-serve listings for re-classification

  The classifier was updated to recognize self-serve wand/spray bays as
  touchless (when no brushes are present). We need to re-classify all
  self-serve listings through the updated classifier to:
  1. Correctly tag brush-free self-serve bays as touchless
  2. Populate touchless_wash_types
  3. Extract equipment_brand/model

  We reset is_touchless to NULL for self-serve listings that are currently
  false, so the classify-batch pipeline picks them up. We do NOT reset
  listings that are already touchless=true (no need to re-classify those).

  We also reset the 772 never-classified self-serve listings (already null).
*/

-- Reset self-serve listings that were classified as NOT touchless
-- so the updated classifier can re-evaluate them
UPDATE listings
SET
  is_touchless = NULL,
  crawl_status = NULL
WHERE
  is_touchless = false
  AND google_subtypes ILIKE '%Self service%'
  AND website IS NOT NULL
  AND website != '';
