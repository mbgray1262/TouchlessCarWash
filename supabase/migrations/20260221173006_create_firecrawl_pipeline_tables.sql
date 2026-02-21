/*
  # Firecrawl Pipeline Tables and Columns

  ## Summary
  Sets up all database infrastructure needed for the national Firecrawl classification pipeline.

  ## New Columns on `listings`
  - `touchless_evidence` (text) — Claude's reasoning for is_touchless classification
  - `website_photos` (jsonb) — Up to 10 filtered image URLs from Firecrawl
  - `last_crawled_at` (timestamptz) — When the listing was last crawled
  - `crawl_status` (text) — Current crawl result: success, no_content, failed, timeout, redirect, robots_blocked

  ## New Table: `pipeline_batches`
  Tracks each submitted Firecrawl batch job (one per chunk of ~2,000-5,000 URLs).
  - `id` (uuid PK)
  - `firecrawl_job_id` (text) — The job ID returned by Firecrawl
  - `status` (text) — pending, running, completed, failed
  - `total_urls` (int) — Number of URLs submitted
  - `completed_count` (int) — URLs that finished
  - `failed_count` (int) — URLs that failed
  - `credits_used` (int)
  - `created_at`, `updated_at`

  ## New Table: `pipeline_runs`
  Tracks individual listing-level results from the pipeline.
  - `id` (uuid PK)
  - `listing_id` (uuid FK → listings)
  - `batch_id` (uuid FK → pipeline_batches)
  - `crawl_status` (text)
  - `is_touchless` (boolean)
  - `touchless_evidence` (text)
  - `raw_markdown` (text) — Store for audit/re-run
  - `images_found` (int)
  - `processed_at` (timestamptz)

  ## Security
  - RLS enabled on both new tables
  - Anon role can read + insert (pipeline runs from server-side with anon key)
*/

-- Add columns to listings
ALTER TABLE listings ADD COLUMN IF NOT EXISTS touchless_evidence text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS website_photos jsonb;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS last_crawled_at timestamptz;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS crawl_status text;

-- Pipeline batches table
CREATE TABLE IF NOT EXISTS pipeline_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firecrawl_job_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total_urls int NOT NULL DEFAULT 0,
  completed_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  credits_used int NOT NULL DEFAULT 0,
  chunk_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pipeline_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read pipeline_batches"
  ON pipeline_batches FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert pipeline_batches"
  ON pipeline_batches FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update pipeline_batches"
  ON pipeline_batches FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Pipeline runs table
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES pipeline_batches(id) ON DELETE SET NULL,
  crawl_status text NOT NULL DEFAULT 'pending',
  is_touchless boolean,
  touchless_evidence text,
  raw_markdown text,
  images_found int NOT NULL DEFAULT 0,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_runs_listing_id_idx ON pipeline_runs(listing_id);
CREATE INDEX IF NOT EXISTS pipeline_runs_batch_id_idx ON pipeline_runs(batch_id);
CREATE INDEX IF NOT EXISTS pipeline_batches_status_idx ON pipeline_batches(status);

ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read pipeline_runs"
  ON pipeline_runs FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert pipeline_runs"
  ON pipeline_runs FOR INSERT
  TO anon
  WITH CHECK (true);
