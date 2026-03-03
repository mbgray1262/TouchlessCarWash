/*
  Update get_chains_with_parent_urls to only return chains
  that have TOUCHLESS listings with parent URLs.
  Previously it returned ALL chains regardless of wash type.
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
    AND l.is_touchless = true
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
