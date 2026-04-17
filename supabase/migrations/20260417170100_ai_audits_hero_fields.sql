-- Add hero image quality evaluation fields to ai_audits
ALTER TABLE ai_audits
  ADD COLUMN IF NOT EXISTS hero_image_quality TEXT,
  ADD COLUMN IF NOT EXISTS hero_image_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS hero_image_recommendation TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_audits_hero_quality ON ai_audits(hero_image_quality);
