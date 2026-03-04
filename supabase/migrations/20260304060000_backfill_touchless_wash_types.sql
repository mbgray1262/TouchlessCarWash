/*
  # Backfill touchless_wash_types for existing touchless listings

  Uses existing data (is_self_service, touchless_evidence) to infer wash types
  without re-classification. This covers the ~2,972 listings already tagged
  as touchless that have empty touchless_wash_types arrays.

  Logic:
  - If evidence mentions automated touchless keywords → touchless_automatic
  - If is_self_service=true AND (evidence mentions wand/spray/self-serve
    without brush concerns) → self_serve_spray
  - Listings can have both types
*/

-- Step 1: Set touchless_automatic for listings with automated touchless evidence
UPDATE listings
SET touchless_wash_types = ARRAY['touchless_automatic']
WHERE is_touchless = true
  AND touchless_wash_types = '{}'
  AND (
    touchless_evidence ILIKE '%automatic touchless%'
    OR touchless_evidence ILIKE '%touchless automatic%'
    OR touchless_evidence ILIKE '%touch-free%'
    OR touchless_evidence ILIKE '%touch free%'
    OR touchless_evidence ILIKE '%laser wash%'
    OR touchless_evidence ILIKE '%laserwash%'
    OR touchless_evidence ILIKE '%contactless%'
    OR touchless_evidence ILIKE '%brushless%'
    OR touchless_evidence ILIKE '%no-touch%'
    OR touchless_evidence ILIKE '%Razor%Touch%'
    OR touchless_evidence ILIKE '%PDQ%'
    OR touchless_evidence ILIKE '%WashWorld%'
    OR touchless_evidence ILIKE '%Petit%'
    OR touchless_evidence ILIKE '%Belanger%'
    OR touchless_evidence ILIKE '%Kondor%'
    OR touchless_evidence ILIKE '%IBA%'
    OR touchless_evidence ILIKE '%in-bay automatic%'
    OR touchless_evidence ILIKE '%touchless tunnel%'
    OR touchless_evidence ILIKE '%touch-free tunnel%'
  );

-- Step 2: Add self_serve_spray for self-service listings
-- For listings that already have touchless_automatic, append self_serve_spray
UPDATE listings
SET touchless_wash_types = touchless_wash_types || ARRAY['self_serve_spray']
WHERE is_touchless = true
  AND is_self_service = true
  AND NOT ('self_serve_spray' = ANY(touchless_wash_types))
  AND (
    touchless_evidence ILIKE '%self-serve%'
    OR touchless_evidence ILIKE '%self serve%'
    OR touchless_evidence ILIKE '%wand%'
    OR touchless_evidence ILIKE '%spray bay%'
    OR touchless_evidence ILIKE '%coin-op%'
    OR touchless_evidence ILIKE '%coin operated%'
    OR touchless_evidence ILIKE '%touchless by definition%'
  );

-- Step 3: Set self_serve_spray ONLY for self-service listings with no automated evidence
UPDATE listings
SET touchless_wash_types = ARRAY['self_serve_spray']
WHERE is_touchless = true
  AND touchless_wash_types = '{}'
  AND is_self_service = true;

-- Step 4: For remaining listings with empty wash types but touchless evidence,
-- default to touchless_automatic (since the original classifier only tagged
-- touchless=true for automated touchless before the self-serve update)
UPDATE listings
SET touchless_wash_types = ARRAY['touchless_automatic']
WHERE is_touchless = true
  AND touchless_wash_types = '{}'
  AND touchless_evidence IS NOT NULL
  AND touchless_evidence != ''
  AND touchless_evidence != '[]';
