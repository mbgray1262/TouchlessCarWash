/*
  # Create increment_photo_enrich_job_counts RPC

  The photo-enrich edge function calls `increment_photo_enrich_job_counts` to
  update processed/succeeded counters on `photo_enrich_jobs`, but this function
  was never created. As a result, processed and succeeded always stayed at 0
  and the UI showed "0 / N done" throughout every run.

  This migration creates the missing RPC and also fixes the `photo_enrich_jobs`
  table to auto-mark itself done when all tasks are completed.
*/

CREATE OR REPLACE FUNCTION increment_photo_enrich_job_counts(
  p_job_id   int,
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
    processed  = processed + p_processed,
    succeeded  = succeeded + p_succeeded,
    updated_at = now()
  WHERE id = p_job_id
  RETURNING total, processed INTO v_total, v_processed;

  IF v_total IS NOT NULL AND v_processed >= v_total THEN
    UPDATE photo_enrich_jobs
    SET status = 'done', finished_at = now()
    WHERE id = p_job_id AND status = 'running';
  END IF;
END;
$$;
