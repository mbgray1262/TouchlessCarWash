
/*
  # Enable pg_net + pg_cron and schedule job watchdog

  1. Enables pg_net for HTTP calls from SQL
  2. Enables pg_cron for scheduled jobs
  3. Creates a cron job that calls the job-watchdog edge function every minute
     to auto-heal any stuck or stalled photo_enrich / gallery_backfill / hero_audit jobs
*/

create extension if not exists pg_net schema extensions;
create extension if not exists pg_cron;

select cron.unschedule('job-watchdog') where exists (
  select 1 from cron.job where jobname = 'job-watchdog'
);

select cron.schedule(
  'job-watchdog',
  '* * * * *',
  $$
  select extensions.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/job-watchdog',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.anon_key', true)
    )
  );
  $$
);
