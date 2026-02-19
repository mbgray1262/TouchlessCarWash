/*
  # Create Firecrawl Jobs Tracking Table

  1. New Tables
    - `crawl_jobs`
      - `id` (uuid, primary key) - Unique identifier for each crawl job
      - `job_id` (text, unique) - Firecrawl job ID from their API
      - `url` (text) - Starting URL for the crawl
      - `status` (text) - Job status: pending, running, completed, failed
      - `crawl_config` (jsonb) - Firecrawl configuration options
      - `results` (jsonb) - Extracted data from crawl
      - `results_count` (integer) - Number of pages crawled
      - `error_message` (text, nullable) - Error details if failed
      - `created_at` (timestamptz) - When job was created
      - `updated_at` (timestamptz) - Last status update
      - `completed_at` (timestamptz, nullable) - When job finished

  2. Security
    - Enable RLS on `crawl_jobs` table
    - Add policy for authenticated users to view all crawl jobs
    - Add policy for authenticated users to create crawl jobs
    - Add policy for service role to update crawl jobs

  3. Notes
    - This table tracks all Firecrawl scraping jobs
    - Webhook updates will modify status and results
    - Results are stored as JSONB for flexible querying
*/

CREATE TABLE IF NOT EXISTS crawl_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text UNIQUE,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  crawl_config jsonb DEFAULT '{}'::jsonb,
  results jsonb DEFAULT '[]'::jsonb,
  results_count integer DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view crawl jobs"
  ON crawl_jobs
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can create crawl jobs"
  ON crawl_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role can update crawl jobs"
  ON crawl_jobs
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_job_id ON crawl_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_created_at ON crawl_jobs(created_at DESC);