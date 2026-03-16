-- Track when a listing was last audited so the batch function
-- doesn't re-audit the same listings over and over.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS photo_audited_at timestamptz;

-- Backfill: mark listings that already have audit results as audited
UPDATE listings
SET photo_audited_at = par.created_at
FROM (
  SELECT DISTINCT ON (listing_id) listing_id, created_at
  FROM photo_audit_results
  ORDER BY listing_id, created_at DESC
) par
WHERE listings.id = par.listing_id
  AND listings.photo_audited_at IS NULL;
