/*
  # Reclassify rocketstores.com false positives

  ## Problem
  79 listings with website = 'https://rocketstores.com/' were incorrectly marked
  is_touchless = true. The classifier misread "Go Frictionless" and "touchless pay"
  as evidence of a touchless car wash. These phrases refer to the Rocket mobile app's
  contactless payment feature — not to the car wash equipment type.

  rocketstores.com is a generic corporate homepage for a gas station/convenience store
  chain. It contains no information about the wash technology at individual locations.

  ## Changes
  - Sets is_touchless = false for all 79 affected listings
  - Updates touchless_evidence to explain the false positive reason
  - Resets last_crawled_at to NULL so they can be re-crawled with better context
*/

UPDATE listings
SET
  is_touchless = false,
  touchless_evidence = 'Reclassified: rocketstores.com homepage references "Go Frictionless" and "touchless pay" in the context of their mobile app payment system — not car wash equipment type. No evidence of touchless washing technology found.',
  last_crawled_at = NULL
WHERE website = 'https://rocketstores.com/'
  AND is_touchless = true
  AND touchless_evidence ILIKE '%Go Frictionless%';
