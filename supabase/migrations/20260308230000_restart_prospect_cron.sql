-- Restart prospect cron with smarter "touchless car wash" search.
-- Now searches Google Places for "touchless car wash {city}" instead of
-- generic "car wash {city}" — much higher hit rate, fewer wasted SerpAPI credits.

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
