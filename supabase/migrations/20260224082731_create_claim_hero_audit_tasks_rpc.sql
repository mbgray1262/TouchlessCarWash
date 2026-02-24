/*
  # Create atomic task claiming RPC for hero audit

  ## Summary
  Creates a function that atomically claims a batch of pending hero audit tasks
  for a given job using FOR UPDATE SKIP LOCKED to prevent race conditions
  when multiple parallel workers are processing the same job.

  ## New Functions
  - `claim_hero_audit_tasks(p_job_id, p_batch_size)` — atomically marks N pending
    tasks as in_progress and returns them; uses row-level locking to prevent
    multiple workers from claiming the same tasks.
*/

CREATE OR REPLACE FUNCTION claim_hero_audit_tasks(
  p_job_id bigint,
  p_batch_size int DEFAULT 10
)
RETURNS TABLE (
  id bigint,
  listing_id uuid,
  listing_name text,
  hero_image_url text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT hat.id
    FROM hero_audit_tasks hat
    WHERE hat.job_id = p_job_id
      AND hat.task_status = 'pending'
    ORDER BY hat.id
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE hero_audit_tasks t
  SET task_status = 'in_progress',
      updated_at = now()
  FROM claimed
  WHERE t.id = claimed.id
  RETURNING t.id, t.listing_id, t.listing_name, t.hero_image_url;
END;
$$;
