/*
  # Reclassify payment-language false positives

  ## Problem
  Two listings were incorrectly marked is_touchless = true based solely on
  payment-related touchless language, not car wash equipment type:

  1. cobblestone.com (Aurora, CO) - describes "Easy Belt Tunnel" which is a
     friction/soft-touch tunnel wash. The "touchless payment experience" cited
     refers to their LPR entry system, not the wash method.

  2. splashautowashusa.com - explicitly mentions brushes and towel drying
     (friction wash). The "optional contactless experience" cited refers to
     LPR/no-window-roll-down entry, not the wash mechanism.

  ## Changes
  - Sets is_touchless = false for both affected listings
  - Updates touchless_evidence to explain the false positive
  - Resets last_crawled_at to NULL for re-crawl
*/

UPDATE listings
SET
  is_touchless = false,
  touchless_evidence = 'Reclassified: Cobblestone uses an "Easy Belt Tunnel" friction wash. The "touchless payment experience" cited refers to LPR-based entry (no window roll-down required), not touchless car wash equipment.',
  last_crawled_at = NULL
WHERE website ILIKE '%cobblestone.com%'
  AND is_touchless = true
  AND touchless_evidence ILIKE '%touchless payment experience%'
  AND touchless_evidence ILIKE '%Easy Belt Tunnel%';

UPDATE listings
SET
  is_touchless = false,
  touchless_evidence = 'Reclassified: Splash Auto Wash uses friction equipment (brushes, towel drying). The "optional contactless experience" cited refers to LPR license plate entry — not a touchless car wash mechanism.',
  last_crawled_at = NULL
WHERE website ILIKE '%splashautowashusa.com%'
  AND is_touchless = true
  AND touchless_evidence ILIKE '%contactless experience%';
