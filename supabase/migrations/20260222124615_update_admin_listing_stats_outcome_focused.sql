/*
  # Update admin_listing_stats to be outcome-focused

  Replace pipeline-state stats (classified, unprocessed, fetch_failed) with
  outcome-focused stats that reflect what actually matters:
  - Touchless / Not Touchless / Unknown (no determination yet)
  - Fetch Failed (a persistent blocker worth knowing)
  - No Website
  - Chains + Featured

  "Unknown" = is_touchless IS NULL regardless of crawl_status.
  This is what genuinely needs attention, not pipeline internals.
*/

CREATE OR REPLACE FUNCTION admin_listing_stats()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total',       COUNT(*),
    'touchless',   COUNT(*) FILTER (WHERE is_touchless = true),
    'notTouchless', COUNT(*) FILTER (WHERE is_touchless = false),
    'unknown',     COUNT(*) FILTER (WHERE is_touchless IS NULL AND (website IS NOT NULL OR crawl_status IS NOT NULL)),
    'fetchFailed', COUNT(*) FILTER (WHERE crawl_status = 'fetch_failed'),
    'noWebsite',   COUNT(*) FILTER (WHERE website IS NULL OR crawl_status = 'no_website'),
    'chains',      COUNT(DISTINCT parent_chain) FILTER (WHERE parent_chain IS NOT NULL),
    'chainsMissingLocationUrl', COUNT(*) FILTER (WHERE parent_chain IS NOT NULL AND location_page_url IS NULL),
    'featured',    COUNT(*) FILTER (WHERE is_featured = true)
  )
  FROM listings;
$$;

GRANT EXECUTE ON FUNCTION admin_listing_stats() TO anon, authenticated;
