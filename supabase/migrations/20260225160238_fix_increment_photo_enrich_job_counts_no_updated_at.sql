/*
  # Fix increment_photo_enrich_job_counts — remove updated_at reference

  photo_enrich_jobs has no updated_at column. Remove it from the RPC.
*/

CREATE OR REPLACE FUNCTION increment_photo_enrich_job_counts(
  p_job_id    int,
  p_processed int,
  p_succeeded int
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_total     int;
  v_processed int;
BEGIN
  UPDATE photo_enrich_jobs
  SET
    processed = processed + p_processed,
    succeeded = succeeded + p_succeeded
  WHERE id = p_job_id
  RETURNING total, processed INTO v_total, v_processed;

  IF v_total IS NOT NULL AND v_processed >= v_total THEN
    UPDATE photo_enrich_jobs
    SET status = 'done', finished_at = now()
    WHERE id = p_job_id AND status = 'running';
  END IF;
END;
$$;
