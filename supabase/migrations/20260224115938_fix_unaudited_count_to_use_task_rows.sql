/*
  # Fix unaudited hero count to use actual task rows

  The count_distinct_audited_hero_listings function was summing the `processed`
  column from job records, which became stale after force_reaudit deleted task rows.
  This caused unaudited_count to show 0 even after a reset.

  We replace the function to count distinct listing_ids in hero_audit_tasks instead,
  which always reflects the actual current state of the table.
*/

CREATE OR REPLACE FUNCTION public.count_distinct_audited_hero_listings()
RETURNS bigint
LANGUAGE sql
AS $$
SELECT COUNT(DISTINCT listing_id)::bigint
FROM hero_audit_tasks;
$$;
