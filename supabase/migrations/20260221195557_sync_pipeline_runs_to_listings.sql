/*
  # Sync pipeline_runs classification results back to listings

  ## Problem
  The firecrawl pipeline writes classification results to pipeline_runs
  but the listings.is_touchless field was not being updated.
  This migration syncs all existing pipeline_runs results to listings.

  ## Changes
  - Updates listings.is_touchless from the most recent pipeline_run result
    for each listing where is_touchless is currently NULL
  - Only uses the most recent run per listing (by processed_at)
  - Never overwrites an existing non-null is_touchless value
*/

UPDATE listings l
SET is_touchless = pr.is_touchless
FROM (
  SELECT DISTINCT ON (listing_id) listing_id, is_touchless
  FROM pipeline_runs
  WHERE is_touchless IS NOT NULL
  ORDER BY listing_id, processed_at DESC
) pr
WHERE l.id = pr.listing_id
  AND l.is_touchless IS NULL;
