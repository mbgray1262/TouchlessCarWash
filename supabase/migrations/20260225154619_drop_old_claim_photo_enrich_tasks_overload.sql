/*
  # Drop old 2-param overload of claim_photo_enrich_tasks

  ## Problem
  There are two overloaded versions of claim_photo_enrich_tasks:
  - Old: (p_job_id bigint, p_limit integer) — no concurrency cap
  - New: (p_job_id bigint, p_limit integer, p_max_concurrency integer) — with concurrency cap

  The edge function calls with 2 params, but when Postgres has two overloads
  with the same first 2 params, the RPC call is ambiguous and Supabase's
  PostgREST layer returns an error (or silently picks the wrong one),
  causing claim to return 0 tasks and the job to stall at processed=0.

  ## Fix
  Drop the old 2-param version. The edge function call site will be updated
  to always pass p_max_concurrency explicitly.
*/

DROP FUNCTION IF EXISTS claim_photo_enrich_tasks(bigint, integer);
