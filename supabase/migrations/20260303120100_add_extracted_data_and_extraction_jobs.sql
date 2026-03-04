/*
  # Add extracted_data JSONB column and extraction job tracking tables

  - extracted_data stores rich structured data extracted from crawl snapshots
  - extraction_jobs / extraction_tasks track batch extraction progress
*/

-- Rich structured data column
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS extracted_data jsonb;

COMMENT ON COLUMN listings.extracted_data IS 'Rich structured data extracted from crawl_snapshot by AI analysis';

-- Job tracking
CREATE TABLE IF NOT EXISTS extraction_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total int NOT NULL DEFAULT 0,
  completed int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE extraction_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on extraction_jobs" ON extraction_jobs FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS extraction_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES extraction_jobs(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE extraction_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on extraction_tasks" ON extraction_tasks FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_extraction_tasks_job_status ON extraction_tasks(job_id, status);
CREATE INDEX IF NOT EXISTS idx_extraction_tasks_listing_id ON extraction_tasks(listing_id);
