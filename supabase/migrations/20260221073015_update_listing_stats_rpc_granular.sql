/*
  # Update listing_stats RPC with granular breakdowns

  Extends the listing_stats function to return more granular counts needed
  for the bulk-verify dashboard:

  - name_match_high: 95% confidence name matches (classification_source = 'name_match')
  - name_match_likely: 70% confidence name matches needing review (classification_source = 'name_match_likely')
  - approved_legacy: approved listings with no classification_source (pre-pipeline / manually set)
  - approved_pipeline: approved listings that went through the pipeline
  - needs_review: auto_classified listings still awaiting human review
*/

CREATE OR REPLACE FUNCTION listing_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total', COUNT(*),
    'unverified', COUNT(*) FILTER (WHERE verification_status = 'unverified' OR verification_status IS NULL),
    'pending', COUNT(*) FILTER (WHERE verification_status = 'pending'),
    'crawled', COUNT(*) FILTER (WHERE verification_status = 'crawled'),
    'auto_classified', COUNT(*) FILTER (WHERE verification_status = 'auto_classified'),
    'approved', COUNT(*) FILTER (WHERE verification_status = 'approved'),
    'approved_legacy', COUNT(*) FILTER (WHERE verification_status = 'approved' AND classification_source IS NULL),
    'approved_pipeline', COUNT(*) FILTER (WHERE verification_status = 'approved' AND classification_source IS NOT NULL),
    'crawl_failed', COUNT(*) FILTER (WHERE verification_status = 'crawl_failed'),
    'chains', COUNT(DISTINCT parent_chain) FILTER (WHERE parent_chain IS NOT NULL),
    'with_chain', COUNT(*) FILTER (WHERE parent_chain IS NOT NULL),
    'name_matched', COUNT(*) FILTER (WHERE classification_source IN ('name_match', 'name_match_likely')),
    'name_match_high', COUNT(*) FILTER (WHERE classification_source = 'name_match'),
    'name_match_likely', COUNT(*) FILTER (WHERE classification_source = 'name_match_likely'),
    'needs_review', COUNT(*) FILTER (WHERE verification_status = 'auto_classified')
  )
  INTO result
  FROM listings;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION listing_stats() TO anon, authenticated;
