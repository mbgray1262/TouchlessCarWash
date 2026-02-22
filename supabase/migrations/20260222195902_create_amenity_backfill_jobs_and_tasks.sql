/*
  # Create amenity_backfill_jobs and amenity_backfill_tasks tables

  ## New Tables

  ### amenity_backfill_jobs
  Tracks a single run of the Amenity Backfill pipeline.
  - `id` (bigint, PK)
  - `status` (text) — 'running', 'done', 'cancelled'
  - `total` (int) — total listings to process
  - `processed` (int) — how many have been attempted
  - `succeeded` (int) — how many had amenities added
  - `started_at`, `finished_at` (timestamptz)

  ### amenity_backfill_tasks
  One row per listing per job.
  - `id` (bigint, PK)
  - `job_id` (bigint, FK → amenity_backfill_jobs)
  - `listing_id` (uuid)
  - `listing_name`, `website`
  - `existing_amenities` (text[]) — snapshot at job start
  - `task_status` — 'pending', 'in_progress', 'done', 'cancelled'
  - `amenities_found` (int), `amenities_added` (text[])
  - `finished_at` (timestamptz)

  ## Security
  - RLS enabled, anon can read/write (needed by edge function)
*/

CREATE TABLE IF NOT EXISTS amenity_backfill_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status text NOT NULL DEFAULT 'running',
  total int NOT NULL DEFAULT 0,
  processed int NOT NULL DEFAULT 0,
  succeeded int NOT NULL DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE amenity_backfill_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read amenity_backfill_jobs"
  ON amenity_backfill_jobs FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert amenity_backfill_jobs"
  ON amenity_backfill_jobs FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update amenity_backfill_jobs"
  ON amenity_backfill_jobs FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS amenity_backfill_tasks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES amenity_backfill_jobs(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL,
  listing_name text,
  website text,
  existing_amenities text[],
  task_status text NOT NULL DEFAULT 'pending',
  amenities_found int,
  amenities_added text[],
  finished_at timestamptz
);

ALTER TABLE amenity_backfill_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read amenity_backfill_tasks"
  ON amenity_backfill_tasks FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert amenity_backfill_tasks"
  ON amenity_backfill_tasks FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update amenity_backfill_tasks"
  ON amenity_backfill_tasks FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_amenity_backfill_tasks_job_status
  ON amenity_backfill_tasks(job_id, task_status);
