-- Add no_hero_mode column to batch_audit_jobs for processing listings without hero images
ALTER TABLE batch_audit_jobs ADD COLUMN IF NOT EXISTS no_hero_mode boolean NOT NULL DEFAULT false;
