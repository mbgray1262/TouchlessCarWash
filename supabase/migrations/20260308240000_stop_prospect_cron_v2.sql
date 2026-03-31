-- Stop prospect cron v2. Already have good coverage of touchless washes
-- in the database. Most results are duplicates. Only 8 SerpAPI credits used.
SELECT cron.unschedule('prospect-scan');
