-- Force cancel all running/pending pipeline batches, bypassing RLS
DO $$
BEGIN
  UPDATE pipeline_batches SET status = 'failed', updated_at = now() WHERE status IN ('running', 'pending');
END $$;