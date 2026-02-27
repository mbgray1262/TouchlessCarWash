/*
  # Fix self-service-only listings incorrectly marked as touchless

  ## Summary
  Finds listings that are marked is_touchless = true but whose AI evidence
  mentions self-service/wand/coin-op/spray-bay keywords and does NOT contain
  any genuine touchless keywords (touchless, touch-free, no-touch, brushless,
  laser wash). These were wrongly classified because the old prompt treated
  self-service wand washes as touchless.

  ## Changes
  - Sets is_touchless = false for listings with self-service evidence but no
    genuine touchless evidence
  - Sets is_self_service = true for those same listings
  - Removes them from listing_filters for the 'touchless' filter
  - Adds them to listing_filters for the 'self-service' filter

  ## Notes
  - Only affects listings where there is NO touchless keyword in the evidence
  - Listings like "self-serve bays + touchless tunnel" that mention both are
    intentionally preserved (they have touchless keywords in evidence)
*/

UPDATE listings
SET
  is_touchless = false,
  is_self_service = true,
  touchless_confidence = 'high',
  classification_confidence = 100
WHERE is_touchless = true
  AND (
    array_to_string(amenities, ' ') ILIKE '%self-serv%'
    OR array_to_string(amenities, ' ') ILIKE '%self serv%'
    OR array_to_string(amenities, ' ') ILIKE '%wand%'
    OR array_to_string(amenities, ' ') ILIKE '%spray bay%'
    OR touchless_evidence ILIKE '%self-serv%'
    OR touchless_evidence ILIKE '%self serv%'
    OR touchless_evidence ILIKE '%wand%'
    OR touchless_evidence ILIKE '%spray bay%'
    OR touchless_evidence ILIKE '%coin-op%'
    OR touchless_evidence ILIKE '%coin op%'
  )
  AND NOT (
    touchless_evidence ILIKE '%touchless%'
    OR touchless_evidence ILIKE '%touch-free%'
    OR touchless_evidence ILIKE '%touch free%'
    OR touchless_evidence ILIKE '%no-touch%'
    OR touchless_evidence ILIKE '%brushless%'
    OR touchless_evidence ILIKE '%laser wash%'
  );

DELETE FROM listing_filters lf
USING filters f
WHERE lf.filter_id = f.id
  AND f.slug = 'touchless'
  AND lf.listing_id IN (
    SELECT id FROM listings WHERE is_touchless = false AND is_self_service = true
  );

INSERT INTO listing_filters (listing_id, filter_id)
SELECT l.id, f.id
FROM listings l
CROSS JOIN filters f
WHERE f.slug = 'self-service'
  AND l.is_self_service = true
ON CONFLICT DO NOTHING;
