-- Unschedule all jobs that use SerpAPI credits to prevent credit burn.
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('prospect-scan', 'review-mine-scan');
