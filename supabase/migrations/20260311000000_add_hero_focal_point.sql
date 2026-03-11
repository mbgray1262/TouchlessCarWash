-- Add hero_focal_point column for AI-driven crop positioning
-- Values: 'top', 'center', 'bottom' - maps to CSS object-position
ALTER TABLE listings ADD COLUMN IF NOT EXISTS hero_focal_point text DEFAULT 'center';
