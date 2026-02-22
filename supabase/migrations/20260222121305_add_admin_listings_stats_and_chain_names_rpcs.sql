/*
  # Admin Listings Stats and Chain Names RPCs

  1. New Functions
    - `admin_listing_stats()` - Returns accurate DB-wide counts for the admin listings page
      based on crawl_status and is_touchless columns.
    - `get_distinct_chain_names()` - Returns all distinct parent_chain values (sorted).

  2. Purpose
    Previously the admin listings page fetched only 1000 rows and computed stats client-side,
    causing inaccurate counts. These RPCs allow the page to get accurate totals across the
    entire dataset regardless of size.
*/

CREATE OR REPLACE FUNCTION admin_listing_stats()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total',      COUNT(*),
    'pending',    COUNT(*) FILTER (WHERE (crawl_status = 'pending' OR crawl_status IS NULL) AND website IS NOT NULL),
    'verified',   COUNT(*) FILTER (WHERE crawl_status = 'crawled'),
    'failed',     COUNT(*) FILTER (WHERE crawl_status = 'failed'),
    'touchless',  COUNT(*) FILTER (WHERE is_touchless = true),
    'noWebsite',  COUNT(*) FILTER (WHERE website IS NULL OR crawl_status = 'no_website'),
    'featured',   COUNT(*) FILTER (WHERE is_featured = true),
    'chains',     COUNT(DISTINCT parent_chain) FILTER (WHERE parent_chain IS NOT NULL),
    'chainsMissingLocationUrl', COUNT(*) FILTER (WHERE parent_chain IS NOT NULL AND location_page_url IS NULL)
  )
  FROM listings;
$$;

GRANT EXECUTE ON FUNCTION admin_listing_stats() TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_distinct_chain_names()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT parent_chain FROM listings WHERE parent_chain IS NOT NULL ORDER BY parent_chain;
$$;

GRANT EXECUTE ON FUNCTION get_distinct_chain_names() TO anon, authenticated;
