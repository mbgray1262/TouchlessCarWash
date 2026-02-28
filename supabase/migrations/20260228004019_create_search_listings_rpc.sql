/*
  # Create search_listings RPC

  Adds a server-side function that handles paginated listing search
  with full-text style filtering. This avoids the broken Supabase JS
  .or() + ilike pattern which breaks on search terms containing spaces.

  Parameters:
    - p_search: free-text search against name, city, state, parent_chain
    - p_status: 'all' | 'touchless' | 'not_touchless' | 'unknown' | 'fetch_failed' | 'no_website'
    - p_chain: 'all' | 'chains_only' | 'independent' | 'missing_location_url' | <chain_name>
    - p_featured: boolean filter
    - p_sort: 'last_crawled_at' | 'name' | 'city'
    - p_sort_dir: 'asc' | 'desc'
    - p_limit: page size
    - p_offset: pagination offset
*/

CREATE OR REPLACE FUNCTION search_listings(
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

GRANT EXECUTE ON FUNCTION search_listings TO anon, authenticated, service_role;
