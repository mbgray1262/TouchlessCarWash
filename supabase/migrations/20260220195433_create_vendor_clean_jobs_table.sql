/*
  # Create vendor_clean_jobs table

  ## Purpose
  Tracks background "clean vendor names" job runs so the UI can poll for
  real-time progress without keeping an open HTTP connection (which would
  time out on long runs).

  ## New Tables
  - `vendor_clean_jobs`
    - `id` (uuid, pk) — job identifier returned to the client
    - `status` — pending | running | done | failed
    - `total` — total vendors to process
    - `processed` — vendors processed so far (incremented by background worker)
    - `changed` — vendors whose name was actually updated
    - `current_batch` — which Claude-batch is currently in flight
    - `total_batches` — total Claude-batches for this run
    - `error` — error message if failed
    - `started_at` / `completed_at` / `created_at`

  ## Security
  - RLS enabled; anon role can insert (to create a job) and select/update
    their own job row (matched by id in the URL — no auth needed for internal admin tool).
    We use a permissive read policy so the UI can poll by job id.
*/

CREATE TABLE IF NOT EXISTS vendor_clean_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','done','failed')),
  total         integer NOT NULL DEFAULT 0,
  processed     integer NOT NULL DEFAULT 0,
  changed       integer NOT NULL DEFAULT 0,
  current_batch integer NOT NULL DEFAULT 0,
  total_batches integer NOT NULL DEFAULT 0,
  error         text,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vendor_clean_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert a job"
  ON vendor_clean_jobs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can read any job"
  ON vendor_clean_jobs FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can update any job"
  ON vendor_clean_jobs FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
