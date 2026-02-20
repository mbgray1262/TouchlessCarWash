/*
  # Create vendor_domain_analysis RPC function

  ## Purpose
  Performs all domain extraction and grouping inside the database, returning
  only aggregated domain-level rows to the browser instead of loading 40,000+
  individual listing rows into memory.

  ## What it does
  1. Extracts the domain from each listing's website URL using regexp
  2. Strips www. prefix
  3. Groups by domain, counting listings and collecting sample names + IDs
  4. Filters out blacklisted social/directory domains
  5. Left-joins with vendors table to identify which domains already have a vendor
  6. Only includes listings that have no vendor_id assigned

  ## Returns
  One row per domain with:
  - domain: the extracted hostname
  - listing_count: number of unmatched listings with this domain
  - listing_ids: array of listing UUIDs for this domain
  - sample_names: up to 5 listing names as a sample
  - vendor_id: if a matching vendor exists (null otherwise)
  - vendor_name: canonical name of matching vendor (null otherwise)
*/

CREATE OR REPLACE FUNCTION vendor_domain_analysis(blacklist text[] DEFAULT '{}')
RETURNS TABLE (
  domain text,
  listing_count bigint,
  listing_ids uuid[],
  sample_names text[],
  vendor_id bigint,
  vendor_name text
)
LANGUAGE sql
STABLE
AS $$
  WITH extracted AS (
    SELECT
      id,
      name,
      -- Extract hostname: grab everything between :// and the next / or end
      -- Then strip leading www.
      regexp_replace(
        lower(
          regexp_replace(
            regexp_replace(website, '^https?://', ''),
            '/.*$', ''
          )
        ),
        '^www\.', ''
      ) AS domain
    FROM listings
    WHERE vendor_id IS NULL
      AND website IS NOT NULL
      AND website <> ''
  ),
  filtered AS (
    SELECT *
    FROM extracted
    WHERE domain IS NOT NULL
      AND domain <> ''
      AND length(domain) >= 4
      AND domain NOT LIKE '%.%' IS FALSE  -- must have a dot (valid domain)
      AND (cardinality(blacklist) = 0 OR domain != ALL(blacklist))
  ),
  grouped AS (
    SELECT
      f.domain,
      count(*) AS listing_count,
      array_agg(f.id) AS listing_ids,
      (array_agg(f.name ORDER BY f.name))[1:5] AS sample_names
    FROM filtered f
    GROUP BY f.domain
  )
  SELECT
    g.domain,
    g.listing_count,
    g.listing_ids,
    g.sample_names,
    v.id::bigint AS vendor_id,
    v.canonical_name AS vendor_name
  FROM grouped g
  LEFT JOIN vendors v ON lower(v.domain) = g.domain
  ORDER BY g.listing_count DESC;
$$;
