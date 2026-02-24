/*
  # Add atomic job counter increment RPC

  ## Purpose
  Fixes a race condition where multiple concurrent edge function invocations
  all read the same stale job.processed/succeeded values and overwrite each other,
  causing the counts to bounce up and down erratically.

  ## Change
  - Creates `increment_photo_enrich_job_counts(job_id, add_processed, add_succeeded)`
    which uses `UPDATE ... SET processed = processed + $n` — a single atomic
    statement that is safe under concurrent calls.
*/

CREATE OR REPLACE FUNCTION increment_photo_enrich_job_counts(
  p_job_id    integer,
  p_processed integer,
  p_succeeded integer
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE photo_enrich_jobs
  SET
    processed = processed + p_processed,
    succeeded = succeeded + p_succeeded
  WHERE id = p_job_id;
$$;
