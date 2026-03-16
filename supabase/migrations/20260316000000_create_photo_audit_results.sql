-- Stores results from batch photo audit pipeline
-- Equipment classification, hero quality assessment, and photo cleanup suggestions
CREATE TABLE photo_audit_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id) ON DELETE CASCADE,
  -- Equipment detection
  equipment_brand text,
  equipment_model text,
  equipment_confidence text,        -- 'high', 'medium', 'low'
  equipment_source_photo text,      -- URL of photo that showed equipment
  -- Hero assessment
  hero_quality text,                -- 'good', 'acceptable', 'poor'
  suggested_hero_url text,
  suggested_hero_reason text,
  -- Photo cleanup
  photos_to_remove text[] DEFAULT '{}',
  -- Full AI response
  raw_response jsonb,
  -- Review tracking
  reviewed boolean DEFAULT false,
  applied boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_photo_audit_listing ON photo_audit_results(listing_id);
CREATE INDEX idx_photo_audit_reviewed ON photo_audit_results(reviewed, applied);
CREATE INDEX idx_photo_audit_confidence ON photo_audit_results(equipment_confidence) WHERE equipment_brand IS NOT NULL;
