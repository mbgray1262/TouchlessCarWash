/*
  # Fix crawl_status check constraint

  The classify-one edge function writes statuses: 'classified', 'fetch_failed', 
  'classify_failed', 'unknown', 'no_website' — but the existing constraint only 
  allows: 'pending', 'crawled', 'failed', 'no_website'.

  This expands the constraint to include all values the pipeline actually uses.
  This is why the touchless count never increased despite the UI showing results.
*/

ALTER TABLE listings DROP CONSTRAINT IF EXISTS valid_crawl_status;

ALTER TABLE listings ADD CONSTRAINT valid_crawl_status CHECK (
  crawl_status IS NULL OR crawl_status IN (
    'pending', 'crawled', 'failed', 'no_website',
    'classified', 'fetch_failed', 'classify_failed', 'unknown'
  )
);
