/*
  # Reclassify Waterless / Mobile Car Wash False Positives

  ## Problem
  The classifier incorrectly tagged waterless and mobile car wash services as
  is_touchless = true. It reasoned that "no water" or "waterless" implied no
  physical contact, which it equated with "touchless". This is wrong.

  A "waterless car wash" is a manual detailing service where a person hand-wipes
  the vehicle with spray chemicals. A "mobile car wash" sends someone to your
  location to hand-wash your car. Neither is an automated drive-through touchless bay.

  ## Changes
  - Sets is_touchless = false for listings where evidence references waterless
    or no-water service models without any mention of an automated tunnel/bay
  - Appends a reclassification note to touchless_evidence

  ## Safety Guards
  Excludes any record that also mentions automated tunnel, drive-through, or
  known automated touchless brand names to avoid correcting genuine positives.
*/

UPDATE listings
SET
  is_touchless = false,
  crawl_status = 'classified',
  touchless_evidence = touchless_evidence || ' [RECLASSIFIED: waterless/mobile/hand-wash service is not an automated touchless wash bay]'
WHERE
  is_touchless = true
  AND (
    touchless_evidence ILIKE '%waterless%'
    OR touchless_evidence ILIKE '%no-water%'
    OR touchless_evidence ILIKE '%no water%wash%'
  )
  AND touchless_evidence NOT ILIKE '%automated touchless%'
  AND touchless_evidence NOT ILIKE '%touchless automatic%'
  AND touchless_evidence NOT ILIKE '%touchless tunnel%'
  AND touchless_evidence NOT ILIKE '%drive-through%'
  AND touchless_evidence NOT ILIKE '%drive through%'
  AND touchless_evidence NOT ILIKE '%touchless in-bay%'
  AND touchless_evidence NOT ILIKE '%laserwash%'
  AND touchless_evidence NOT ILIKE '%laser wash%'
  AND touchless_evidence NOT ILIKE '%razor%'
  AND touchless_evidence NOT ILIKE '%petit%'
  AND touchless_evidence NOT ILIKE '%our touchless wash%'
  AND touchless_evidence NOT ILIKE '%we offer touch%';
