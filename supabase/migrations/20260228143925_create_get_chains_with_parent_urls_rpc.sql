/*
  # Create get_chains_with_parent_urls RPC

  Returns all chain vendors that have listings still pointing to the parent
  company URL instead of individual location URLs, ordered by the count of
  such listings descending. Used by the Chain URL Backfill admin tool.
*/

CREATE OR REPLACE FUNCTION get_chains_with_parent_urls()
RETURNS TABLE (
  id integer,
  canonical_name text,
  domain text,
  parent_url_count bigint
)
LANGUAGE sql
STABLE
SET statement_timeout = '30s'
AS $$
  SELECT
    v.id,
    v.canonical_name,
    v.domain,
    COUNT(*) AS parent_url_count
  FROM listings l
  JOIN vendors v ON l.vendor_id = v.id
  WHERE v.is_chain = true
    AND v.domain IS NOT NULL
    AND l.website IS NOT NULL
    AND (
      l.website = 'https://' || v.domain
      OR l.website = 'http://' || v.domain
      OR l.website = 'https://www.' || v.domain
      OR l.website = 'http://www.' || v.domain
      OR l.website = 'https://' || v.domain || '/'
      OR l.website = 'http://' || v.domain || '/'
      OR l.website = 'https://www.' || v.domain || '/'
      OR l.website = 'http://www.' || v.domain || '/'
    )
  GROUP BY v.id, v.canonical_name, v.domain
  ORDER BY COUNT(*) DESC;
$$;
