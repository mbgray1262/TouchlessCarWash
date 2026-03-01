/*
  # Chain URL Backfill Job Tracking

  Creates a table to track automated chain URL backfill jobs.
  A single job processes all chains sequentially in the background.

  ## Tables
  - `chain_url_backfill_jobs` — one row per run, tracks overall progress
  - `chain_url_backfill_results` — one row per vendor processed, captures match stats

  ## Security
  - RLS disabled (admin-only internal table)
*/

CREATE TABLE IF NOT EXISTS chain_url_backfill_jobs (
  id bigserial PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  total_chains integer NOT NULL DEFAULT 0,
  chains_processed integer NOT NULL DEFAULT 0,
  total_matched integer NOT NULL DEFAULT 0,
  total_unmatched integer NOT NULL DEFAULT 0,
  current_vendor_name text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS chain_url_backfill_results (
  id bigserial PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES chain_url_backfill_jobs(id) ON DELETE CASCADE,
  vendor_id integer NOT NULL,
  vendor_name text NOT NULL,
  domain text NOT NULL,
  locations_url_used text,
  links_found integer NOT NULL DEFAULT 0,
  matched integer NOT NULL DEFAULT 0,
  unmatched integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chain_url_backfill_results_job_id ON chain_url_backfill_results(job_id);
