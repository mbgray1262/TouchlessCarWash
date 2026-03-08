/*
  Schedule automated prospecting as a server-side background job.

  Runs every 3 minutes via pg_cron + pg_net, calling the review-mine
  edge function's prospect_next action.

  Each run picks the highest-priority pending city from prospect_queue,
  searches Google Places for car washes, checks reviews via SerpAPI,
  and imports any confirmed touchless washes.

  The job automatically does nothing when the queue is empty
  (the edge function returns { done: true }).

  To check progress:  SELECT * FROM prospect_queue ORDER BY id;
  To check the job:   SELECT * FROM cron.job WHERE jobname = 'prospect-scan';
  To stop the job:    SELECT cron.unschedule('prospect-scan');
*/

-- Remove if already exists (idempotent)
SELECT cron.unschedule('prospect-scan')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prospect-scan');

SELECT cron.schedule(
  'prospect-scan',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gteqijdpqjmgxfnyuhvy.supabase.co/functions/v1/review-mine',
    body := '{"action":"prospect_next"}'::jsonb,
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78"}'::jsonb
  );
  $$
);
