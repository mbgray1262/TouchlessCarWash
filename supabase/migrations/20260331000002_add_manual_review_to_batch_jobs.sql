-- Add manual_review column to batch_audit_jobs
-- When true: no AI calls, no auto-apply — all listings queued for human review
ALTER TABLE batch_audit_jobs ADD COLUMN IF NOT EXISTS manual_review boolean NOT NULL DEFAULT false;
