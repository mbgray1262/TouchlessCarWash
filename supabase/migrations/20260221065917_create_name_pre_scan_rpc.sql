/*
  # Create name_pre_scan RPC function

  Creates a server-side function that bulk-updates listings based on name keywords,
  bypassing PostgREST's default 1000-row limit. Runs as SECURITY DEFINER so it
  can update all matching rows regardless of RLS.

  Returns counts of rows updated in each category.
*/

CREATE OR REPLACE FUNCTION name_pre_scan()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  touchless_count integer;
  likely_count integer;
BEGIN
  -- Count and update confirmed touchless by name keywords
  SELECT COUNT(*) INTO touchless_count
  FROM listings
  WHERE is_touchless IS NOT TRUE
    AND verification_status IN ('pending', 'unverified')
    AND (
      name ILIKE '%touchless%' OR
      name ILIKE '%touch free%' OR
      name ILIKE '%touchfree%' OR
      name ILIKE '%brushless%' OR
      name ILIKE '%laserwash%' OR
      name ILIKE '%no touch%' OR
      name ILIKE '%notouch%' OR
      name ILIKE '%no-touch%' OR
      name ILIKE '%friction free%' OR
      name ILIKE '%frictionfree%'
    );

  UPDATE listings
  SET
    is_touchless = true,
    verification_status = 'auto_classified',
    classification_confidence = 95,
    classification_source = 'name_match'
  WHERE is_touchless IS NOT TRUE
    AND verification_status IN ('pending', 'unverified')
    AND (
      name ILIKE '%touchless%' OR
      name ILIKE '%touch free%' OR
      name ILIKE '%touchfree%' OR
      name ILIKE '%brushless%' OR
      name ILIKE '%laserwash%' OR
      name ILIKE '%no touch%' OR
      name ILIKE '%notouch%' OR
      name ILIKE '%no-touch%' OR
      name ILIKE '%friction free%' OR
      name ILIKE '%frictionfree%'
    );

  -- Count and update likely touchless (laser keyword)
  SELECT COUNT(*) INTO likely_count
  FROM listings
  WHERE is_touchless IS NOT TRUE
    AND verification_status IN ('pending', 'unverified')
    AND classification_source IS NULL
    AND name ILIKE '%laser%';

  UPDATE listings
  SET
    verification_status = 'auto_classified',
    classification_confidence = 70,
    classification_source = 'name_match_likely'
  WHERE is_touchless IS NOT TRUE
    AND verification_status IN ('pending', 'unverified')
    AND classification_source IS NULL
    AND name ILIKE '%laser%';

  RETURN json_build_object(
    'touchless', touchless_count,
    'likelyTouchless', likely_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION name_pre_scan() TO anon, authenticated;
