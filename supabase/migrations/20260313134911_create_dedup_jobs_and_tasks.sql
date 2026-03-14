/*
  # Create dedup_jobs and dedup_tasks tables

  ## Summary
  Adds tables for tracking AI-powered listing deduplication jobs.
  Groups of listings sharing the same address+city+state are evaluated
  by Claude AI to determine if they should be merged or skipped.

  ## New Tables
  - dedup_jobs: tracks overall batch progress
  - dedup_tasks: one row per duplicate group to evaluate
*/

CREATE TABLE IF NOT EXISTS dedup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  scope text NOT NULL DEFAULT 'all',
  total int NOT NULL DEFAULT 0,
  completed int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  merged int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dedup_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage dedup jobs"
  ON dedup_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read dedup jobs"
  ON dedup_jobs FOR SELECT TO anon USING (true);


CREATE TABLE IF NOT EXISTS dedup_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES dedup_jobs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  -- Group snapshot
  group_key text NOT NULL,
  listing_ids uuid[] NOT NULL,
  listing_names text[],
  vendor_ids int[],
  same_vendor boolean NOT NULL DEFAULT false,
  group_size int NOT NULL DEFAULT 2,
  -- AI decision
  decision text,
  ai_reasoning text,
  confidence text,
  survivor_id uuid,
  duplicate_ids uuid[],
  -- Execution results
  fields_merged text[],
  child_records_moved int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dedup_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage dedup tasks"
  ON dedup_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read dedup tasks"
  ON dedup_tasks FOR SELECT TO anon USING (true);

CREATE INDEX IF NOT EXISTS idx_dedup_tasks_job_status ON dedup_tasks(job_id, status);
CREATE INDEX IF NOT EXISTS idx_dedup_tasks_decision ON dedup_tasks(decision);
