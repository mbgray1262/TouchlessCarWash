/*
  # Add fallback tracking to chain URL backfill results

  Tracks whether AI-powered fallback (locations page scraping) was used
  instead of Firecrawl /map for URL discovery.
*/

ALTER TABLE chain_url_backfill_results
  ADD COLUMN IF NOT EXISTS fallback_used boolean DEFAULT false;
