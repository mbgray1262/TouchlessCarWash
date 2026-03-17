-- Server-side batch job tracking so processing continues even if the browser is closed
CREATE TABLE batch_audit_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running', -- running, completed, failed
  total_requested int NOT NULL,
  total_processed int NOT NULL DEFAULT 0,
  dry_run boolean NOT NULL DEFAULT false,
  include_google_photos boolean NOT NULL DEFAULT true,
  -- accumulated stats
  equipment_detected int NOT NULL DEFAULT 0,
  heroes_replaced int NOT NULL DEFAULT 0,
  photos_removed int NOT NULL DEFAULT 0,
  auto_applied int NOT NULL DEFAULT 0,
  google_photos_added int NOT NULL DEFAULT 0,
  google_photos_screened int NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: only authenticated users can read/create jobs
ALTER TABLE batch_audit_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage batch jobs"
  ON batch_audit_jobs FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Service role bypass for edge function
CREATE POLICY "Service role full access on batch_audit_jobs"
  ON batch_audit_jobs FOR ALL
  USING (auth.role() = 'service_role');
