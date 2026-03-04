/*
  # Reclassify Self-Serve Car Washes as Touchless (Conservative)

  Our touchless definition: "No automated friction contact with the vehicle —
  includes touch-free automatics, laser washes, and self-serve wand/spray bays
  that do NOT include brushes."

  CONSERVATIVE PRINCIPLE: If we cannot confirm the self-serve bays are
  spray/wand-only (no brushes), we do NOT label as touchless.

  The original classifier had Rule 2: "SELF-SERVICE IS NEVER TOUCHLESS" — which
  rejected all self-serve listings. We now recognize that self-serve wand/spray
  bays ARE touchless, but ONLY when confirmed to be brush-free.

  This migration ONLY flips listings where the classifier's own evidence
  explicitly confirms wand/spray-only operation without brushes. All other
  self-serve listings will be re-classified through the updated classifier
  which checks for brushes in self-serve bays.

  We do NOT flip:
  - Any listing where evidence mentions brushes (foam brush, hog's hair, etc.)
  - Any listing where we can't confirm the bays are spray/wand-only
  - Unclassified listings (even with no website — can't confirm no brushes)
  - Mixed operations (need re-classification to check self-serve bay details)
*/

-- Only flip listings where the classifier explicitly confirmed:
-- 1. It's a self-serve with wand/spray operation ("touchless by definition")
-- 2. Evidence specifically mentions wand, spray, or pressure washer
-- 3. No mention of any type of brush anywhere in the evidence
UPDATE listings
SET
  is_touchless = true
WHERE
  is_touchless = false
  AND touchless_evidence ILIKE '%touchless by definition%'
  AND (
    touchless_evidence ILIKE '%wand%'
    OR touchless_evidence ILIKE '%spray%'
    OR touchless_evidence ILIKE '%pressure wash%'
    OR touchless_evidence ILIKE '%high-pressure%'
    OR touchless_evidence ILIKE '%high pressure%'
  )
  AND touchless_evidence NOT ILIKE '%foam brush%'
  AND touchless_evidence NOT ILIKE '%hogs hair%'
  AND touchless_evidence NOT ILIKE '%hog''s hair%'
  AND touchless_evidence NOT ILIKE '%brushes%'
  AND touchless_evidence NOT ILIKE '%hand-held brush%'
  AND touchless_evidence NOT ILIKE '%scrub brush%';
