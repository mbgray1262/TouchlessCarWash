-- Sequential classification job tracking
-- Replaces the Firecrawl batch approach with one-at-a-time processing
-- so results appear immediately as each listing is classified.

CREATE TABLE IF NOT EXISTS classify_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  status text NOT NULL DEFAULT 'running',
  total integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  succeeded integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS classify_tasks (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES classify_jobs(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL,
  website text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classify_tasks_job_status_idx ON classify_tasks(job_id, status);
CREATE INDEX IF NOT EXISTS classify_tasks_listing_idx ON classify_tasks(listing_id);
