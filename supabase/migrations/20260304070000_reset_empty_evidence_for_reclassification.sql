/*
  Reset 322 touchless listings that have empty evidence ("[]") and empty
  wash types. These were tagged touchless from name matching (e.g. "Laser Wash",
  "Brushless") but were never properly classified by the AI classifier.

  Resetting is_touchless to NULL so classify-batch will pick them up.
  Only reset those with websites (296 of 322) — the remaining 26 without
  websites can't be classified anyway.
*/

UPDATE listings
SET is_touchless = NULL,
    crawl_status = NULL,
    touchless_evidence = NULL,
    touchless_wash_types = '{}'
WHERE is_touchless = true
  AND touchless_wash_types = '{}'
  AND (touchless_evidence = '[]' OR touchless_evidence IS NULL OR touchless_evidence = '')
  AND website IS NOT NULL
  AND website != '';
