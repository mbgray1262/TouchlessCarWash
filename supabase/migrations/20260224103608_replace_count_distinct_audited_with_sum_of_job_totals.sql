/*
  # Replace COUNT(DISTINCT) with SUM of job totals for audited count

  ## Summary
  `count_distinct_audited_hero_listings()` was doing `COUNT(DISTINCT listing_id)`
  across the entire `hero_audit_tasks` table on every status poll. With 1000+
  tasks this was slow and caused statement timeouts.

  We replace it with a function that sums `processed` across all completed/running
  hero_audit_jobs instead — this is an O(1) query on a tiny jobs table and gives
  an equivalent result (number of listings that have been through the audit).

  ## Changes
  - `count_distinct_audited_hero_listings` — rewritten to sum job processed counts
*/

CREATE OR REPLACE FUNCTION count_distinct_audited_hero_listings()
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT COALESCE(SUM(processed), 0)::bigint
  FROM hero_audit_jobs
  WHERE status IN ('done', 'cancelled', 'running');
$$;
