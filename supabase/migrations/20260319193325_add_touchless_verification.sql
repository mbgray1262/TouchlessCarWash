-- Add touchless verification columns to listings
-- touchless_verified: null (unverified), 'user_review' (auto-detected from reviews), 'admin' (manually confirmed)
-- touchless_evidence: stores the review snippet used as evidence

ALTER TABLE listings ADD COLUMN IF NOT EXISTS touchless_verified text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS touchless_evidence text;
