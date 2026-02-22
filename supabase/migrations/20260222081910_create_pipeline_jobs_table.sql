/*
  # Create pipeline_jobs table for background classification

  1. New Tables
    - `pipeline_jobs`
      - `id` (uuid, primary key)
      - `status` (text: queued, running, paused, done, failed)
      - `concurrency` (int, how many parallel workers)
      - `processed_count` (int, how many listings processed so far)
      - `touchless_count` (int, classified as touchless this run)
      - `not_touchless_count` (int, classified as not touchless this run)
      - `unknown_count` (int, classified as unknown this run)
      - `failed_count` (int, failed to fetch/classify this run)
      - `total_queue` (int, total unclassified with website at start)
      - `offset` (int, current position in queue)
      - `started_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `finished_at` (timestamptz)
      - `error` (text, last error if any)

  2. Security
    - Enable RLS
    - Allow anon read/insert/update (admin-only tool, no auth system)
*/

CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'paused', 'done', 'failed')),
  concurrency int NOT NULL DEFAULT 3,
  processed_count int NOT NULL DEFAULT 0,
  touchless_count int NOT NULL DEFAULT 0,
  not_touchless_count int NOT NULL DEFAULT 0,
  unknown_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  total_queue int NOT NULL DEFAULT 0,
  "offset" int NOT NULL DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  error text
);

ALTER TABLE pipeline_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read pipeline_jobs"
  ON pipeline_jobs FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert pipeline_jobs"
  ON pipeline_jobs FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon update pipeline_jobs"
  ON pipeline_jobs FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
