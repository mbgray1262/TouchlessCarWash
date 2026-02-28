/*
  # Set statement timeout inside admin_listing_stats RPC

  ## Problem
  The admin_listing_stats function does COUNT(*) across 55k rows. Even though
  we increased the anon role's statement_timeout to 30s, that only applies to
  new connections. Existing pooled connections still have the old 3s timeout.

  ## Fix
  Rewrite the function to set a local statement_timeout at the start,
  ensuring it always runs with enough time regardless of connection pool state.
*/

CREATE OR REPLACE FUNCTION public.admin_listing_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL statement_timeout = '25s';
  RETURN (
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
    FROM listings
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_listing_stats TO anon, authenticated, service_role;
