-- Schedule daily refresh of best_of_rankings via pg_cron.
-- Runs at 3:00 AM UTC daily, calling the compute-rankings edge function.

SELECT cron.schedule(
  'daily-compute-rankings',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gteqijdpqjmgxfnyuhvy.supabase.co/functions/v1/compute-rankings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
