/*
  # Update admin_listing_stats to be pipeline-aware

  The old function used crawl_status = 'crawled' for "verified" which was the
  legacy manual Firecrawl verification flow. The bulk classification pipeline
  uses crawl_status = 'classified', 'fetch_failed', 'unknown', 'classify_failed'.

  This migration rewrites admin_listing_stats() to surface meaningful pipeline
  stats instead of the misleading old verified/pending counts.

  New fields:
  - total: all listings
  - touchless: is_touchless = true
  - notTouchless: is_touchless = false
  - classified: crawl_status = 'classified' (pipeline success)
  - unprocessed: crawl_status IS NULL AND website IS NOT NULL (ready for pipeline)
  - fetchFailed: crawl_status = 'fetch_failed'
  - classifyFailed: crawl_status IN ('classify_failed', 'unknown')
  - noWebsite: website IS NULL OR crawl_status = 'no_website'
  - chains: distinct parent_chain count
  - chainsMissingLocationUrl: chain locations without a location-specific URL
  - featured: is_featured = true
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
    'classified',  COUNT(*) FILTER (WHERE crawl_status = 'classified'),
    'unprocessed', COUNT(*) FILTER (WHERE crawl_status IS NULL AND website IS NOT NULL),
    'fetchFailed', COUNT(*) FILTER (WHERE crawl_status = 'fetch_failed'),
    'classifyFailed', COUNT(*) FILTER (WHERE crawl_status IN ('classify_failed', 'unknown')),
    'noWebsite',   COUNT(*) FILTER (WHERE website IS NULL OR crawl_status = 'no_website'),
    'chains',      COUNT(DISTINCT parent_chain) FILTER (WHERE parent_chain IS NOT NULL),
    'chainsMissingLocationUrl', COUNT(*) FILTER (WHERE parent_chain IS NOT NULL AND location_page_url IS NULL),
    'featured',    COUNT(*) FILTER (WHERE is_featured = true)
  )
  FROM listings;
$$;

GRANT EXECUTE ON FUNCTION admin_listing_stats() TO anon, authenticated;
