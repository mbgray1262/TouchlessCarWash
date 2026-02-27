/*
  # Reclassify Template Boilerplate False Positives

  ## Problem
  Two categories of listings were incorrectly tagged as is_touchless = true:

  1. TEMPLATE BOILERPLATE SITES: Websites on platforms like edan.io, keeq.io, jany.io,
     lany.io, webbo.me auto-generate a generic "industry analysis" or "expert analysis"
     section that mentions touchless technology as an industry trend. The classifier
     mistook this editorial copy for a first-person service claim by the business.

  2. SELF-SERVICE MISCLASSIFICATION: The classifier reasoned that "self-service is
     touchless by definition" — which contradicts our directory's definition. Self-service
     wand bays are never automated touchless washes.

  ## Changes
  - Sets is_touchless = false for listings where touchless_evidence references
    boilerplate industry sections (not the business's own service claims)
  - Sets is_touchless = false for listings where the only "evidence" is that
    self-service washes are "touchless by definition"
  - Sets crawl_status = 'classified' (reset so they can be re-crawled with
    the improved classifier)
  - Appends a note to touchless_evidence explaining the correction

  ## Affected Records
  Estimated ~100-130 listings out of 3,020 currently marked touchless.

  ## Safety Guards
  Both UPDATE statements include negative filters to protect listings that have
  genuine first-person service claims (e.g. "our touchless wash", "laserwash",
  specific brand names) even if their evidence string also contains boilerplate language.
*/

UPDATE listings
SET
  is_touchless = false,
  crawl_status = 'classified',
  touchless_evidence = touchless_evidence || ' [RECLASSIFIED: evidence was generic industry/template copy, not a first-person service claim by this business]'
WHERE
  is_touchless = true
  AND (
    touchless_evidence ILIKE '%industry analysis section%'
    OR touchless_evidence ILIKE '%expert analysis section%'
    OR touchless_evidence ILIKE '%industry overview%'
    OR touchless_evidence ILIKE '%industry description section%'
    OR touchless_evidence ILIKE '%comprehensive car wash industry%'
    OR touchless_evidence ILIKE '%comprehensive industry%'
    OR touchless_evidence ILIKE '%expert analysis%'
    OR touchless_evidence ILIKE '%industry analysis%'
  )
  AND touchless_evidence NOT ILIKE '%our touchless%'
  AND touchless_evidence NOT ILIKE '%we offer touch%'
  AND touchless_evidence NOT ILIKE '%touchless automatic bays%'
  AND touchless_evidence NOT ILIKE '%touchless automatic wash%'
  AND touchless_evidence NOT ILIKE '%touchless in-bay%'
  AND touchless_evidence NOT ILIKE '%laserwash%'
  AND touchless_evidence NOT ILIKE '%laser wash%'
  AND touchless_evidence NOT ILIKE '%razor%'
  AND touchless_evidence NOT ILIKE '%petit%';

UPDATE listings
SET
  is_touchless = false,
  crawl_status = 'classified',
  touchless_evidence = touchless_evidence || ' [RECLASSIFIED: self-service wand bays are not automated touchless washes per directory definition]'
WHERE
  is_touchless = true
  AND (
    touchless_evidence ILIKE '%self-service%touchless by definition%'
    OR touchless_evidence ILIKE '%self service%touchless by definition%'
    OR touchless_evidence ILIKE '%touchless by definition%'
  )
  AND touchless_evidence NOT ILIKE '%automated touchless%'
  AND touchless_evidence NOT ILIKE '%touchless automatic%'
  AND touchless_evidence NOT ILIKE '%touchless in-bay%'
  AND touchless_evidence NOT ILIKE '%our touchless%'
  AND touchless_evidence NOT ILIKE '%touch-free%'
  AND touchless_evidence NOT ILIKE '%touch free%'
  AND touchless_evidence NOT ILIKE '%laserwash%'
  AND touchless_evidence NOT ILIKE '%laser wash%';
