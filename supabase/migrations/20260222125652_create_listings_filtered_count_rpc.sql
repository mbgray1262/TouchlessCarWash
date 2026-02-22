/*
  # Create listings_filtered_count RPC

  ## Summary
  The admin listings page was using PostgREST's `count: exact` on every data fetch,
  forcing a full table scan + data retrieval in a single request. With 55k+ rows this
  consistently times out under PostgREST's default statement timeout.

  This RPC accepts the same filter parameters and returns just the count, allowing
  the admin page to fetch count and data separately (and skip count refresh when only
  paging through results).

  ## Parameters
  - p_search text — ilike filter across name, city, state, parent_chain
  - p_status text — 'all','touchless','not_touchless','unknown','fetch_failed','no_website'
  - p_chain text — 'all','chains_only','independent','missing_location_url', or exact name
  - p_featured boolean — if true, only featured listings

  ## Returns
  integer — total matching row count
*/

CREATE OR REPLACE FUNCTION listings_filtered_count(
  p_search   text    DEFAULT NULL,
  p_status   text    DEFAULT 'all',
  p_chain    text    DEFAULT 'all',
  p_featured boolean DEFAULT false
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM listings
  WHERE
    -- search
    (
      p_search IS NULL OR p_search = '' OR
      name        ILIKE '%' || p_search || '%' OR
      city        ILIKE '%' || p_search || '%' OR
      state       ILIKE '%' || p_search || '%' OR
      parent_chain ILIKE '%' || p_search || '%'
    )
    -- status filter
    AND CASE p_status
      WHEN 'touchless'     THEN is_touchless = true
      WHEN 'not_touchless' THEN is_touchless = false
      WHEN 'unknown'       THEN is_touchless IS NULL AND (website IS NOT NULL OR crawl_status IS NOT NULL)
      WHEN 'fetch_failed'  THEN crawl_status = 'fetch_failed'
      WHEN 'no_website'    THEN website IS NULL OR crawl_status = 'no_website'
      ELSE true
    END
    -- chain filter
    AND CASE p_chain
      WHEN 'all'                  THEN true
      WHEN 'chains_only'          THEN parent_chain IS NOT NULL
      WHEN 'independent'          THEN parent_chain IS NULL
      WHEN 'missing_location_url' THEN parent_chain IS NOT NULL AND location_page_url IS NULL
      ELSE parent_chain = p_chain
    END
    -- featured
    AND (NOT p_featured OR is_featured = true);
$$;

GRANT EXECUTE ON FUNCTION listings_filtered_count(text, text, text, boolean) TO anon, authenticated;
