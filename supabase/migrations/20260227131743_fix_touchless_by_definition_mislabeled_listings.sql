/*
  # Fix listings mislabeled touchless via "touchless by definition" reasoning

  ## Problem
  An earlier AI prompt incorrectly classified self-service wand/spray washes as
  "touchless" because it reasoned that self-serve spray wands are "touchless by
  definition." This is wrong — the touchless category refers only to automated
  in-bay or tunnel systems with no brushes/friction, not to self-operated wand washes.

  ## What this migration fixes
  Listings where:
    - is_touchless = true AND is_self_service = true
    - touchless_evidence contains "touchless by definition"
    - touchless_evidence does NOT contain any genuine automated-touchless keywords
      (laser, automatic touchless, touchless automatic, touchless tunnel,
       touchless wash, touch-free, touch free, no-touch, brushless)

  These 336 listings were self-service only and were incorrectly promoted to touchless.

  ## Changes
  1. Sets is_touchless = false for the 336 mislabeled listings
  2. Removes them from listing_filters for the 'touchless' filter

  ## NOT changed
  229 listings that contain "touchless by definition" but ALSO have real touchless
  keywords (laser, automatic touchless, etc.) — those are genuine hybrids and are
  intentionally preserved.
*/

UPDATE listings
SET is_touchless = false
WHERE is_touchless = true
  AND is_self_service = true
  AND touchless_evidence ILIKE '%touchless by definition%'
  AND NOT (
    touchless_evidence ILIKE '%laser%'
    OR touchless_evidence ILIKE '%automatic touchless%'
    OR touchless_evidence ILIKE '%touchless automatic%'
    OR touchless_evidence ILIKE '%touchless tunnel%'
    OR touchless_evidence ILIKE '%touchless wash%'
    OR touchless_evidence ILIKE '%touch-free%'
    OR touchless_evidence ILIKE '%touch free%'
    OR touchless_evidence ILIKE '%no-touch%'
    OR touchless_evidence ILIKE '%brushless%'
  );

DELETE FROM listing_filters lf
USING filters f, listings l
WHERE lf.filter_id = f.id
  AND lf.listing_id = l.id
  AND f.slug = 'touchless'
  AND l.is_touchless = false
  AND l.is_self_service = true;
