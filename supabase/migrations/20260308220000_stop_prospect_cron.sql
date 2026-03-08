-- Stop the prospect cron job. 4 cities processed, 0 touchless found, 117 credits used.
-- Need a better approach before burning more SerpAPI credits.
SELECT cron.unschedule('prospect-scan');
