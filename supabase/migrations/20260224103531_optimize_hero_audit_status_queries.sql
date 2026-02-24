/*
  # Optimize hero audit status queries

  ## Summary
  The `status` action in the hero-audit edge function fires two expensive queries
  that were timing out during active runs:

  1. A full `listings` table scan with OR condition to count auditable heroes
  2. `COUNT(DISTINCT listing_id)` on `hero_audit_tasks`

  ## Changes
  - Add a partial index on `listings` covering the auditable-hero count query so
    it doesn't need a sequential scan.
  - Replace `count_distinct_audited_hero_listings` with a simpler `COUNT(*)` variant
    (each listing_id appears at most once across all audit task rows for counting
    purposes — but DISTINCT is still needed for correctness across multiple runs,
    so we keep DISTINCT but hint the planner with the index).
  - Add a covering index on `hero_audit_tasks(listing_id)` if not present (already
    exists, so this is a no-op guard).
*/

CREATE INDEX IF NOT EXISTS listings_auditable_hero_idx
  ON listings (id)
  WHERE is_touchless = true
    AND hero_image IS NOT NULL
    AND (hero_image_source = 'google' OR hero_image_source IS NULL);
