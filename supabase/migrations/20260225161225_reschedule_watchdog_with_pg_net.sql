
/*
  # Reschedule watchdog cron using pg_net directly

  Replaces the http_post cron with a pg_net.http_post call using the
  project's actual Supabase URL and anon key hardcoded for reliability.
*/

select cron.unschedule('job-watchdog');

select cron.schedule(
  'job-watchdog',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://gteqijdpqjmgxfnyuhvy.supabase.co/functions/v1/job-watchdog',
    body := '{}'::jsonb,
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78"}'::jsonb
  );
  $$
);
