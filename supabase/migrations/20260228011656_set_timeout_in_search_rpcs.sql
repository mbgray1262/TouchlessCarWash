/*
  # Set statement_timeout inside search RPCs

  ## Problem
  The listings_filtered_count and search_listings functions can exceed the
  connection pool's statement_timeout setting. Using SET LOCAL ensures
  these functions always have sufficient time regardless of connection state.

  ## Changes
  - Rewrites listings_filtered_count as plpgsql to use SET LOCAL statement_timeout
  - Rewrites search_listings to include SET LOCAL statement_timeout
*/

CREATE OR REPLACE FUNCTION public.listings_filtered_count(
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_chain text DEFAULT 'all',
  p_featured boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result integer;
BEGIN
  SET LOCAL statement_timeout = '25s';
  SELECT COUNT(*)::integer INTO result
  FROM listings
  WHERE
    (p_search IS NULL OR p_search = '' OR
     name         ILIKE '%' || p_search || '%' OR
     city         ILIKE '%' || p_search || '%' OR
     state        ILIKE '%' || p_search || '%' OR
     parent_chain ILIKE '%' || p_search || '%')
  AND CASE p_status
    WHEN 'touchless'     THEN is_touchless = true
    WHEN 'not_touchless' THEN is_touchless = false
    WHEN 'unknown'       THEN is_touchless IS NULL AND (website IS NOT NULL OR crawl_status IS NOT NULL)
    WHEN 'fetch_failed'  THEN crawl_status = 'fetch_failed'
    WHEN 'no_website'    THEN website IS NULL OR crawl_status = 'no_website'
    ELSE true
  END
  AND CASE p_chain
    WHEN 'all'                  THEN true
    WHEN 'chains_only'          THEN parent_chain IS NOT NULL
    WHEN 'independent'          THEN parent_chain IS NULL
    WHEN 'missing_location_url' THEN parent_chain IS NOT NULL AND location_page_url IS NULL
    ELSE parent_chain = p_chain
  END
  AND (NOT p_featured OR is_featured = true);

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listings_filtered_count TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.search_listings(
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_chain text DEFAULT 'all',
  p_featured boolean DEFAULT false,
  p_sort text DEFAULT 'last_crawled_at',
  p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS SETOF listings
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL statement_timeout = '25s';
  RETURN QUERY EXECUTE format(
    'SELECT * FROM listings
     WHERE
       ($1 IS NULL OR $1 = '''' OR
        name ILIKE ''%%'' || $1 || ''%%'' OR
        city ILIKE ''%%'' || $1 || ''%%'' OR
        state ILIKE ''%%'' || $1 || ''%%'' OR
        parent_chain ILIKE ''%%'' || $1 || ''%%'')
     AND CASE $2
       WHEN ''touchless''     THEN is_touchless = true
       WHEN ''not_touchless'' THEN is_touchless = false
       WHEN ''unknown''       THEN is_touchless IS NULL AND (website IS NOT NULL OR crawl_status IS NOT NULL)
       WHEN ''fetch_failed''  THEN crawl_status = ''fetch_failed''
       WHEN ''no_website''    THEN website IS NULL OR crawl_status = ''no_website''
       ELSE true
     END
     AND CASE $3
       WHEN ''all''                  THEN true
       WHEN ''chains_only''          THEN parent_chain IS NOT NULL
       WHEN ''independent''          THEN parent_chain IS NULL
       WHEN ''missing_location_url'' THEN parent_chain IS NOT NULL AND location_page_url IS NULL
       ELSE parent_chain = $3
     END
     AND (NOT $4 OR is_featured = true)
     ORDER BY %I %s NULLS LAST
     LIMIT $5 OFFSET $6',
    CASE p_sort
      WHEN 'name' THEN 'name'
      WHEN 'city' THEN 'city'
      ELSE 'last_crawled_at'
    END,
    CASE WHEN p_sort_dir = 'asc' THEN 'ASC' ELSE 'DESC' END
  )
  USING p_search, p_status, p_chain, p_featured, p_limit, p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_listings TO anon, authenticated, service_role;
