/*
  # Create Hero Audit Jobs and Tasks Tables

  ## Purpose
  Re-screens the 2,603 Google hero images that were previously marked "trusted" without
  going through Claude Haiku classification. Each image will now be classified as GOOD,
  BAD_CONTACT, or BAD_OTHER. Bad images will have their hero cleared so the listing falls
  back to street view or triggers re-enrichment.

  ## New Tables

  ### hero_audit_jobs
  Tracks a batch re-screening run.
  - `id` — auto-increment PK
  - `status` — running | done | cancelled
  - `total` — total tasks created
  - `processed` — tasks completed so far
  - `succeeded` — tasks where verdict is GOOD (hero kept)
  - `cleared` — tasks where hero was cleared (BAD verdict)
  - `started_at`, `finished_at`

  ### hero_audit_tasks
  One row per listing being re-screened.
  - `id` — auto-increment PK
  - `job_id` — FK to hero_audit_jobs
  - `listing_id` — FK to listings (uuid)
  - `listing_name` — denormalized for display
  - `hero_image_url` — the URL being screened
  - `task_status` — pending | in_progress | done
  - `verdict` — GOOD | BAD_CONTACT | BAD_OTHER | fetch_failed
  - `reason` — Claude's one-sentence reason
  - `action_taken` — kept | cleared | skipped
  - `finished_at`
  - `updated_at`

  ## Security
  - RLS enabled on both tables
  - Anon read/write allowed (same pattern as other admin tables in this project)
*/

CREATE TABLE IF NOT EXISTS hero_audit_jobs (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'cancelled')),
  total integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  succeeded integer NOT NULL DEFAULT 0,
  cleared integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE hero_audit_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read hero_audit_jobs"
  ON hero_audit_jobs FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon can insert hero_audit_jobs"
  ON hero_audit_jobs FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon can update hero_audit_jobs"
  ON hero_audit_jobs FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS hero_audit_tasks (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  job_id bigint NOT NULL REFERENCES hero_audit_jobs(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL,
  listing_name text,
  hero_image_url text NOT NULL,
  task_status text NOT NULL DEFAULT 'pending' CHECK (task_status IN ('pending', 'in_progress', 'done', 'cancelled')),
  verdict text,
  reason text,
  action_taken text,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hero_audit_tasks_job_id_status_idx ON hero_audit_tasks (job_id, task_status);
CREATE INDEX IF NOT EXISTS hero_audit_tasks_listing_id_idx ON hero_audit_tasks (listing_id);

ALTER TABLE hero_audit_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read hero_audit_tasks"
  ON hero_audit_tasks FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon can insert hero_audit_tasks"
  ON hero_audit_tasks FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon can update hero_audit_tasks"
  ON hero_audit_tasks FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION increment_hero_audit_job_counts(
  p_job_id bigint,
  p_processed integer,
  p_succeeded integer,
  p_cleared integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE hero_audit_jobs
  SET
    processed = processed + p_processed,
    succeeded = succeeded + p_succeeded,
    cleared   = cleared   + p_cleared
  WHERE id = p_job_id;
END;
$$;
