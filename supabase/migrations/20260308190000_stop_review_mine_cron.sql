-- Stop the review mine cron job to conserve SerpAPI credits.
-- Hit rate is ~2.1% — not worth burning remaining credits on.
-- Credits better used for prospecting new areas.
SELECT cron.unschedule('review-mine-scan');
