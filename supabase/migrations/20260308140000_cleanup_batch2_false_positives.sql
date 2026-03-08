-- Clean up false positives from second scan batch.
-- These listings were marked touchless_found but the keyword matches were in
-- negative context (e.g., "looking for brushless, go elsewhere" or
-- "even a touchless car wash does a better job").
-- Going forward, AI verification will prevent these.

-- Delete review snippets that don't genuinely indicate touchless evidence
-- (same logic as previous cleanup)
DELETE FROM review_snippets
WHERE source = 'serpapi'
  AND NOT (
    lower(review_text) LIKE '%touchless%'
    OR lower(review_text) LIKE '%touch-free%'
    OR lower(review_text) LIKE '%touchfree%'
    OR lower(review_text) LIKE '%touch free%'
    OR lower(review_text) LIKE '%brushless%'
    OR lower(review_text) LIKE '%brush-free%'
    OR lower(review_text) LIKE '%brushfree%'
    OR lower(review_text) LIKE '%brush free%'
    OR lower(review_text) LIKE '%no brush%'
    OR lower(review_text) LIKE '%no-brush%'
    OR lower(review_text) LIKE '%laser wash%'
    OR lower(review_text) LIKE '%laserwash%'
    OR lower(review_text) LIKE '%no-touch%'
    OR lower(review_text) LIKE '%no touch%'
    OR lower(review_text) LIKE '%notouch%'
    OR lower(review_text) LIKE '%frictionless%'
    OR lower(review_text) LIKE '%friction-free%'
    OR lower(review_text) LIKE '%soft-touch%'
    OR lower(review_text) LIKE '%soft touch%'
  );

-- Revert listings that now have zero genuine review snippets back to non-touchless
UPDATE listings
SET is_touchless = false,
    is_approved = false,
    review_mine_status = 'scanned_clean',
    review_extract_status = NULL,
    touchless_review_count = 0,
    crawl_notes = 'Reverted: AI verification not yet active when originally scanned.'
WHERE review_mine_status = 'touchless_found'
  AND id NOT IN (
    SELECT DISTINCT listing_id FROM review_snippets WHERE source = 'serpapi'
  );

-- Update touchless_review_count for remaining touchless_found listings
UPDATE listings l
SET touchless_review_count = sub.cnt
FROM (
  SELECT listing_id, count(*) as cnt
  FROM review_snippets
  WHERE source = 'serpapi'
  GROUP BY listing_id
) sub
WHERE l.id = sub.listing_id
  AND l.review_mine_status = 'touchless_found';

-- Reset all scanned_clean listings so they can be re-scanned with AI verification
UPDATE listings
SET review_mine_status = NULL
WHERE review_mine_status = 'scanned_clean';
