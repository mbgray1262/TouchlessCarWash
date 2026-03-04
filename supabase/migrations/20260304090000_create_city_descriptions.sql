/*
  # Add city descriptions table and batch job tracking

  ## Summary
  Adds support for AI-generated unique city descriptions that improve SEO
  and differentiate each city page from the others.

  ## New Tables
  - `city_descriptions`
    - One row per (state, city) with a unique AI-generated description
    - Readable by anon role (used by city pages at build/request time)

  - `city_description_jobs` / `city_description_tasks`
    - Batch processing tables (service role only)
*/

CREATE TABLE IF NOT EXISTS city_descriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  city text NOT NULL,
  description text,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(state, city)
);

ALTER TABLE city_descriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read city descriptions"
  ON city_descriptions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role can manage city descriptions"
  ON city_descriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_city_descriptions_state_city ON city_descriptions(state, city);

-- Job tracking tables (service role only)

CREATE TABLE IF NOT EXISTS city_description_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total int NOT NULL DEFAULT 0,
  completed int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE city_description_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage city description jobs"
  ON city_description_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS city_description_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES city_description_jobs(id) ON DELETE CASCADE,
  state text NOT NULL,
  city text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE city_description_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage city description tasks"
  ON city_description_tasks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_city_description_tasks_job_status ON city_description_tasks(job_id, status);
