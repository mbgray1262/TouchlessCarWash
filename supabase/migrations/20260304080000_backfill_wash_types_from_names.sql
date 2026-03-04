/*
  Set touchless_wash_types for 26 listings tagged touchless by name
  but with no website/evidence. Their names contain "touchless",
  "touch free", "touch-free", or "laserwash" — all automated touchless.
*/

UPDATE listings
SET touchless_wash_types = ARRAY['touchless_automatic']
WHERE is_touchless = true
  AND touchless_wash_types = '{}'
  AND (touchless_evidence = '[]' OR touchless_evidence IS NULL OR touchless_evidence = '')
  AND (
    name ILIKE '%touchless%'
    OR name ILIKE '%touch free%'
    OR name ILIKE '%touch-free%'
    OR name ILIKE '%laserwash%'
    OR name ILIKE '%laser wash%'
    OR name ILIKE '%brushless%'
    OR name ILIKE '%no-touch%'
  );
