/*
  # Create Gallery Backfill Jobs and Tasks Tables

  ## Purpose
  Tracks backfill runs that find listings with a google_place_id but fewer than 3
  gallery photos, then fetches up to 5 additional Google Place API photos for each,
  running each through Claude Haiku classification before saving. This is a standalone
  process independent of photo_enrichment_attempted_at.

  ## New Tables

  ### gallery_backfill_jobs
  - `id` (bigint, PK) — auto-increment job identifier
  - `status` (text) — 'running', 'done', 'cancelled'
  - `total` (int) — total listings queued for this job
  - `processed` (int) — how many listings have been processed
  - `succeeded` (int) — how many listings gained at least one new photo
  - `started_at` (timestamptz)
  - `finished_at` (timestamptz)

  ### gallery_backfill_tasks
  One row per listing per job. Tracks per-listing inputs and results.
  - `id` (bigint, PK)
  - `job_id` (bigint, FK → gallery_backfill_jobs)
  - `listing_id` (uuid, FK → listings)
  - `listing_name` (text) — snapshot for display
  - `google_place_id` (text) — snapshot
  - `photos_before` (int) — gallery photo count at task start
  - `task_status` (text) — 'pending', 'in_progress', 'done', 'cancelled'
  - `place_photos_fetched` (int) — how many raw photos returned by Places API
  - `place_photos_screened` (int) — how many were sent to Claude
  - `place_photos_approved` (int) — how many passed GOOD verdict
  - `photos_after` (int) — gallery photo count after save
  - `fallback_reason` (text) — why nothing was added, if applicable
  - `finished_at` (timestamptz)
  - `updated_at` (timestamptz) — for stuck-task recovery

  ## Security
  - RLS enabled on both tables
  - Anon key granted full CRUD (matching pattern used by photo_enrich_jobs/tasks)

  ## Notes
  - Indexes on (job_id, task_status) for efficient batch querying
  - updated_at column used for stuck-task timeout recovery
*/

CREATE TABLE IF NOT EXISTS gallery_backfill_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status text NOT NULL DEFAULT 'running',
  total int NOT NULL DEFAULT 0,
  processed int NOT NULL DEFAULT 0,
  succeeded int NOT NULL DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE gallery_backfill_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can select gallery_backfill_jobs"
  ON gallery_backfill_jobs FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert gallery_backfill_jobs"
  ON gallery_backfill_jobs FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update gallery_backfill_jobs"
  ON gallery_backfill_jobs FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS gallery_backfill_tasks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES gallery_backfill_jobs(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL,
  listing_name text,
  google_place_id text,
  photos_before int NOT NULL DEFAULT 0,
  task_status text NOT NULL DEFAULT 'pending',
  place_photos_fetched int NOT NULL DEFAULT 0,
  place_photos_screened int NOT NULL DEFAULT 0,
  place_photos_approved int NOT NULL DEFAULT 0,
  photos_after int NOT NULL DEFAULT 0,
  fallback_reason text,
  finished_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE gallery_backfill_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can select gallery_backfill_tasks"
  ON gallery_backfill_tasks FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert gallery_backfill_tasks"
  ON gallery_backfill_tasks FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update gallery_backfill_tasks"
  ON gallery_backfill_tasks FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_gallery_backfill_tasks_job_status
  ON gallery_backfill_tasks (job_id, task_status);

CREATE INDEX IF NOT EXISTS idx_gallery_backfill_tasks_updated_at
  ON gallery_backfill_tasks (updated_at);
