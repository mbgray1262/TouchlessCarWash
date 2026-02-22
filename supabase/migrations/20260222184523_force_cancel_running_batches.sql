-- Force all running pipeline batches to failed status
UPDATE pipeline_batches SET status = 'failed', updated_at = now() WHERE status = 'running' OR status = 'pending';