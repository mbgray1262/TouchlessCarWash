/*
  # Add AI-generated description column and description generation job tables

  ## Summary
  Adds support for AI-generated listing descriptions that improve SEO and help customers
  understand what each car wash offers.

  ## Changes

  ### Modified Tables
  - `listings`
    - `description` (text): AI-generated description paragraph for the listing
    - `description_generated_at` (timestamptz): When the description was last generated

  ### New Tables
  - `description_jobs`
    - Tracks a batch job for generating descriptions across many listings
    - Columns: id, status, total, completed, failed, created_at, updated_at

  - `description_tasks`
    - One row per listing to process in a given job
    - Columns: id, job_id, listing_id, status, error, created_at, updated_at

  ### Security
  - RLS enabled on both new tables
  - Only service role can read/write (admin-only pipeline tables)
*/

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS description_generated_at timestamptz;

CREATE TABLE IF NOT EXISTS description_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total int NOT NULL DEFAULT 0,
  completed int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE description_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage description jobs"
  ON description_jobs FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert description jobs"
  ON description_jobs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update description jobs"
  ON description_jobs FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS description_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES description_jobs(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE description_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage description tasks"
  ON description_tasks FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert description tasks"
  ON description_tasks FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update description tasks"
  ON description_tasks FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_description_tasks_job_status ON description_tasks(job_id, status);
CREATE INDEX IF NOT EXISTS idx_description_tasks_listing_id ON description_tasks(listing_id);
CREATE INDEX IF NOT EXISTS idx_listings_description_generated_at ON listings(description_generated_at);
