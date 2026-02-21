/*
  # Create listing_stats RPC function

  Returns aggregate counts for the bulk-verify dashboard in a single query,
  bypassing PostgREST's 1000-row limit by running server-side.

  Returns:
  - total: total listing count
  - counts per verification_status
  - unique chain count
  - name_matched count (classification_source in name_match / name_match_likely)
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
    'crawl_failed', COUNT(*) FILTER (WHERE verification_status = 'crawl_failed'),
    'chains', COUNT(DISTINCT parent_chain) FILTER (WHERE parent_chain IS NOT NULL),
    'with_chain', COUNT(*) FILTER (WHERE parent_chain IS NOT NULL),
    'name_matched', COUNT(*) FILTER (WHERE classification_source IN ('name_match', 'name_match_likely'))
  )
  INTO result
  FROM listings;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION listing_stats() TO anon, authenticated;
