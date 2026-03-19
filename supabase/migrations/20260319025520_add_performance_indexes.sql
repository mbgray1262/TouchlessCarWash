-- Performance indexes for photo_audit_results table
-- These columns are used in WHERE/ORDER BY clauses in the photo audit admin page
CREATE INDEX IF NOT EXISTS idx_photo_audit_results_listing_id ON photo_audit_results (listing_id);
CREATE INDEX IF NOT EXISTS idx_photo_audit_results_reviewed ON photo_audit_results (reviewed);
CREATE INDEX IF NOT EXISTS idx_photo_audit_results_applied ON photo_audit_results (applied);
CREATE INDEX IF NOT EXISTS idx_photo_audit_results_created_at ON photo_audit_results (created_at DESC);

-- Composite index for the most common query pattern: unreviewed results ordered by date
CREATE INDEX IF NOT EXISTS idx_photo_audit_results_reviewed_created ON photo_audit_results (reviewed, created_at DESC);

-- Performance indexes for listings table
-- These columns are frequently filtered on in admin queries
CREATE INDEX IF NOT EXISTS idx_listings_is_touchless ON listings (is_touchless);
CREATE INDEX IF NOT EXISTS idx_listings_classification_source ON listings (classification_source);
CREATE INDEX IF NOT EXISTS idx_listings_equipment_brand ON listings (equipment_brand);
