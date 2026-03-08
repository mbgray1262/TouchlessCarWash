/*
  Schedule review mining as a server-side background job.

  Runs every 2 minutes via pg_cron + pg_net, calling the review-mine
  edge function's scan_batch action with batch_size=25.

  The job automatically does nothing when all listings are scanned
  (the edge function returns immediately with scanned_this_batch=0).

  To check progress:  SELECT * FROM cron.job WHERE jobname = 'review-mine-scan';
  To stop the job:    SELECT cron.unschedule('review-mine-scan');
*/

-- Remove if already exists (idempotent)
SELECT cron.unschedule('review-mine-scan')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'review-mine-scan');

SELECT cron.schedule(
  'review-mine-scan',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gteqijdpqjmgxfnyuhvy.supabase.co/functions/v1/review-mine',
    body := '{"action":"scan_batch","batch_size":25}'::jsonb,
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78"}'::jsonb
  );
  $$
);
