/*
  # Fix cancel and increment RPCs for photo enrichment

  ## Problems Fixed

  1. Cancel was NOT marking in_progress tasks as cancelled — only pending tasks.
     This meant already-claimed tasks kept running even after a job was cancelled.

  2. increment_photo_enrich_job_counts was incrementing counters even on cancelled jobs,
     causing processed counts to accumulate on jobs that were supposedly stopped.

  ## Changes

  - `cancel_photo_enrich_job` new RPC: atomically cancels the job AND all pending/in_progress tasks
  - `increment_photo_enrich_job_counts`: now skips the update if the job status is 'cancelled'
*/

-- Fix increment to skip cancelled jobs
CREATE OR REPLACE FUNCTION increment_photo_enrich_job_counts(
  p_job_id bigint,
  p_processed int,
  p_succeeded int
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE photo_enrich_jobs
  SET
    processed = processed + p_processed,
    succeeded = succeeded + p_succeeded
  WHERE id = p_job_id
    AND status NOT IN ('cancelled', 'done');
END;
$$;
