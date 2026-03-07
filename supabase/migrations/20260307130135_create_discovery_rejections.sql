CREATE TABLE discovery_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id text NOT NULL UNIQUE,
  name text,
  reason text DEFAULT 'not_touchless',
  created_at timestamptz DEFAULT now()
);

-- RLS: allow service_role full access (admin-only table)
ALTER TABLE discovery_rejections ENABLE ROW LEVEL SECURITY;
