/*
  # Create increment_pipeline_job_counts RPC

  Atomically increments pipeline_jobs counters to avoid race conditions
  when multiple concurrent workers update the same job row.
*/

CREATE OR REPLACE FUNCTION increment_pipeline_job_counts(
  p_job_id uuid,
  p_processed int,
  p_touchless int,
  p_not_touchless int,
  p_unknown int,
  p_failed int,
  p_offset int
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE pipeline_jobs SET
    processed_count = processed_count + p_processed,
    touchless_count = touchless_count + p_touchless,
    not_touchless_count = not_touchless_count + p_not_touchless,
    unknown_count = unknown_count + p_unknown,
    failed_count = failed_count + p_failed,
    "offset" = p_offset,
    updated_at = now()
  WHERE id = p_job_id;
END;
$$;
