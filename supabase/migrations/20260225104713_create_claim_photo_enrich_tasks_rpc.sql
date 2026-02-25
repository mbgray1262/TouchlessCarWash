/*
  # Create atomic task claiming RPC for photo enrichment

  ## Purpose
  Replaces the non-atomic SELECT + UPDATE pattern in the photo-enrich edge function
  with a single atomic SQL operation using FOR UPDATE SKIP LOCKED.

  ## Why this is needed
  Without this, two concurrent edge function invocations can both SELECT the same
  pending tasks before either has updated them to in_progress, causing double-processing,
  duplicate RPC counter increments, and the processed count going up then down.

  ## New Function
  - `claim_photo_enrich_tasks(p_job_id, p_limit)` — atomically claims up to p_limit
    pending tasks for a job by setting them to in_progress in a single transaction.
    Returns the claimed task rows. Uses FOR UPDATE SKIP LOCKED so concurrent callers
    never claim the same task.
*/

CREATE OR REPLACE FUNCTION claim_photo_enrich_tasks(p_job_id bigint, p_limit int DEFAULT 1)
RETURNS SETOF photo_enrich_tasks
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE photo_enrich_tasks
  SET task_status = 'in_progress',
      updated_at = now()
  WHERE id IN (
    SELECT id FROM photo_enrich_tasks
    WHERE job_id = p_job_id
      AND task_status = 'pending'
    ORDER BY id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;
