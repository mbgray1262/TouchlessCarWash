/*
  # Create Street View Audit Jobs and Tasks Tables

  ## Purpose
  Screen all listings where hero_image_source = 'street_view' through Claude Haiku
  to verify they actually show a usable car wash exterior. Street view images were
  used as blind fallbacks during hero audit without any AI screening, so some may
  show generic road shots, wrong angles, or unrelated content.

  ## New Tables

  ### street_view_audit_jobs
  - Tracks each batch run of the street view screening process
  - `id` — auto-incrementing primary key
  - `status` — running | done | cancelled
  - `total` — number of listings in this job
  - `processed` — how many have been screened so far
  - `succeeded` — how many passed (GOOD verdict, hero kept)
  - `cleared` — how many were cleared (BAD verdict, hero set to null)
  - `started_at` / `finished_at` — timing

  ### street_view_audit_tasks
  - One row per listing being screened
  - `job_id` — FK to street_view_audit_jobs
  - `listing_id` — FK to listings
  - `listing_name` — denormalized for display
  - `hero_image_url` — the street view URL being screened
  - `task_status` — pending | in_progress | done | cancelled
  - `verdict` — GOOD | BAD_OTHER | fetch_failed
  - `reason` — Claude's one-sentence explanation
  - `action_taken` — kept | cleared
  - `updated_at` — for stuck-task detection

  ## Security
  - RLS enabled on both tables
  - Anon users can read and insert (admin tool, no auth system)

  ## Helper RPCs
  - `claim_street_view_audit_tasks` — atomic claim of a batch of pending tasks
  - `increment_street_view_audit_job_counts` — atomic counter increment
*/

-- ── Jobs table ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS street_view_audit_jobs (
  id          serial PRIMARY KEY,
  status      text NOT NULL DEFAULT 'running'
                CHECK (status IN ('running', 'done', 'cancelled')),
  total       integer NOT NULL DEFAULT 0,
  processed   integer NOT NULL DEFAULT 0,
  succeeded   integer NOT NULL DEFAULT 0,
  cleared     integer NOT NULL DEFAULT 0,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE street_view_audit_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read street_view_audit_jobs"
  ON street_view_audit_jobs FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert street_view_audit_jobs"
  ON street_view_audit_jobs FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update street_view_audit_jobs"
  ON street_view_audit_jobs FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- ── Tasks table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS street_view_audit_tasks (
  id              serial PRIMARY KEY,
  job_id          integer NOT NULL REFERENCES street_view_audit_jobs(id) ON DELETE CASCADE,
  listing_id      uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  listing_name    text NOT NULL DEFAULT '',
  hero_image_url  text NOT NULL DEFAULT '',
  task_status     text NOT NULL DEFAULT 'pending'
                    CHECK (task_status IN ('pending', 'in_progress', 'done', 'cancelled')),
  verdict         text CHECK (verdict IN ('GOOD', 'BAD_OTHER', 'fetch_failed')),
  reason          text,
  action_taken    text CHECK (action_taken IN ('kept', 'cleared')),
  finished_at     timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sv_audit_tasks_job_status
  ON street_view_audit_tasks(job_id, task_status);

ALTER TABLE street_view_audit_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read street_view_audit_tasks"
  ON street_view_audit_tasks FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert street_view_audit_tasks"
  ON street_view_audit_tasks FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update street_view_audit_tasks"
  ON street_view_audit_tasks FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- ── claim_street_view_audit_tasks RPC ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION claim_street_view_audit_tasks(
  p_job_id    integer,
  p_batch_size integer DEFAULT 10
)
RETURNS SETOF street_view_audit_tasks
LANGUAGE sql
AS $$
  UPDATE street_view_audit_tasks
  SET task_status = 'in_progress',
      updated_at  = now()
  WHERE id IN (
    SELECT id FROM street_view_audit_tasks
    WHERE job_id     = p_job_id
      AND task_status = 'pending'
    ORDER BY id
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- ── increment_street_view_audit_job_counts RPC ────────────────────────────────
CREATE OR REPLACE FUNCTION increment_street_view_audit_job_counts(
  p_job_id    integer,
  p_processed integer DEFAULT 0,
  p_succeeded integer DEFAULT 0,
  p_cleared   integer DEFAULT 0
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE street_view_audit_jobs
  SET processed = processed + p_processed,
      succeeded = succeeded + p_succeeded,
      cleared   = cleared   + p_cleared
  WHERE id = p_job_id;
$$;
