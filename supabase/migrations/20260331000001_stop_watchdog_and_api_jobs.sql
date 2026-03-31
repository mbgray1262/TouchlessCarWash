/*
  # Stop watchdog cron and all auto-running AI API jobs

  The job-watchdog was running every minute and auto-triggering:
  - generate-descriptions (Claude Haiku) → Anthropic API charges
  - detect-equipment (Claude Haiku + Gemini) → API charges

  Unschedule the watchdog cron to stop all automated API spending.
  Manual triggers via the admin panel still work — this only stops
  the automatic background execution.
*/

SELECT cron.unschedule('job-watchdog');
