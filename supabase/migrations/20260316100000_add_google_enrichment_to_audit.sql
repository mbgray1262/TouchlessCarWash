-- Add Google photo enrichment tracking to photo_audit_results
ALTER TABLE photo_audit_results
  ADD COLUMN google_photos_added integer DEFAULT 0,
  ADD COLUMN google_photos_screened integer DEFAULT 0;
