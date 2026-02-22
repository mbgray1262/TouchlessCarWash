/*
  # Create photo_enrich_jobs and photo_enrich_tasks tables

  ## New Tables

  ### photo_enrich_jobs
  Tracks a single run of the Photo Enrichment pipeline.
  - `id` (bigint, PK)
  - `status` (text) — 'running', 'done', 'cancelled'
  - `total` (int) — total listings to process
  - `processed` (int) — how many have been attempted
  - `succeeded` (int) — how many got a hero image
  - `started_at` (timestamptz)
  - `finished_at` (timestamptz)

  ### photo_enrich_tasks
  One row per listing per job. Tracks individual listing enrichment state.
  - `id` (bigint, PK)
  - `job_id` (bigint, FK)
  - `listing_id` (uuid)
  - `listing_name`, `website`, `google_photo_url`, `google_logo_url`, `street_view_url`
  - `current_hero`, `current_logo`, `current_crawl_notes` — snapshot at job start
  - `task_status` — 'pending', 'in_progress', 'done', 'cancelled'
  - `hero_image_found` (bool), `hero_source` (text), `gallery_count` (int), `logo_found` (bool)
  - `finished_at` (timestamptz)

  ## Security
  - RLS enabled on both tables
  - Anon key can read/write (needed by edge function with anon key calls)
*/

CREATE TABLE IF NOT EXISTS photo_enrich_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status text NOT NULL DEFAULT 'running',
  total int NOT NULL DEFAULT 0,
  processed int NOT NULL DEFAULT 0,
  succeeded int NOT NULL DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE photo_enrich_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read photo_enrich_jobs"
  ON photo_enrich_jobs FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert photo_enrich_jobs"
  ON photo_enrich_jobs FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update photo_enrich_jobs"
  ON photo_enrich_jobs FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS photo_enrich_tasks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES photo_enrich_jobs(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL,
  listing_name text,
  website text,
  google_photo_url text,
  google_logo_url text,
  street_view_url text,
  current_hero text,
  current_logo text,
  current_crawl_notes text,
  task_status text NOT NULL DEFAULT 'pending',
  hero_image_found boolean,
  hero_source text,
  gallery_count int,
  logo_found boolean,
  finished_at timestamptz
);

ALTER TABLE photo_enrich_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read photo_enrich_tasks"
  ON photo_enrich_tasks FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert photo_enrich_tasks"
  ON photo_enrich_tasks FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update photo_enrich_tasks"
  ON photo_enrich_tasks FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_photo_enrich_tasks_job_status
  ON photo_enrich_tasks(job_id, task_status);
