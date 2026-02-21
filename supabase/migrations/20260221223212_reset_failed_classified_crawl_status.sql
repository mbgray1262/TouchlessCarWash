/*
  # Reset crawl_status for listings that need re-classification

  ## Reason
  ~188 listings were processed by classify-one and received crawl_status = 'failed'
  due to fetch failures. A small number may have gotten crawl_status = 'classified'
  but had their is_touchless silently dropped due to the jsonb bug (now fixed).

  ## Changes
  - Listings with crawl_status = 'failed': reset to NULL so they re-enter the queue
  - Listings with crawl_status = 'classified' but is_touchless IS NULL: also reset
    (these are the broken ones where the update payload was rejected)

  ## Safe
  - Does NOT touch any listings where is_touchless is already set (330 touchless + 27861 not_touchless)
  - Does NOT affect verification_status
*/

UPDATE listings
SET crawl_status = NULL, last_crawled_at = NULL
WHERE crawl_status = 'failed';

UPDATE listings
SET crawl_status = NULL, last_crawled_at = NULL
WHERE crawl_status = 'classified' AND is_touchless IS NULL;
