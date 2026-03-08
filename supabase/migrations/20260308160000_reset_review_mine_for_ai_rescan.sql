-- Reset all review-mined listings for re-scan with fixed AI verification.
--
-- The AI verification step was using an invalid model ID ('claude-3-5-haiku-latest'),
-- causing every API call to fail and silently fall back to keyword-only matching.
-- This means ALL touchless_found listings from review mining are potentially
-- false positives. Reset them so the pipeline can re-evaluate with working AI.

-- Step 1: Delete all review snippets from review mining (they'll be re-inserted on rescan)
DELETE FROM review_snippets
WHERE source = 'serpapi'
  AND listing_id IN (
    SELECT id FROM listings WHERE review_mine_status = 'touchless_found'
  );

-- Step 2: Revert touchless_found listings back to unscanned
UPDATE listings
SET is_touchless = false,
    is_approved = false,
    review_mine_status = NULL,
    review_extract_status = NULL,
    touchless_review_count = 0,
    crawl_notes = 'Reset: AI verification was broken (invalid model ID). Queued for rescan.'
WHERE review_mine_status = 'touchless_found';

-- Step 3: Also reset scanned_clean listings — the AI may have incorrectly
-- rejected some that are actually touchless (since AI never ran, keyword-only
-- results were used for both positive and negative paths)
UPDATE listings
SET review_mine_status = NULL
WHERE review_mine_status = 'scanned_clean';

-- Step 4: Remove touchless-automatic filter entries for reverted listings
DELETE FROM listing_filters lf
WHERE lf.filter_id IN (SELECT id FROM filters WHERE slug = 'touchless-automatic')
  AND lf.listing_id IN (
    SELECT id FROM listings
    WHERE is_touchless = false
      AND crawl_notes LIKE 'Reset: AI verification was broken%'
  );
