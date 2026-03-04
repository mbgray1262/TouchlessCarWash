-- Jobs table for crawl4ai scraping runs
CREATE TABLE IF NOT EXISTS crawl4ai_jobs (
  id SERIAL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  total INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual tasks for each listing being scraped
CREATE TABLE IF NOT EXISTS crawl4ai_tasks (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES crawl4ai_jobs(id),
  listing_id UUID NOT NULL,
  listing_name TEXT,
  website TEXT,
  task_status TEXT NOT NULL DEFAULT 'pending',
  content_length INTEGER,
  images_found INTEGER,
  error_message TEXT,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawl4ai_tasks_job_status ON crawl4ai_tasks(job_id, task_status);
CREATE INDEX IF NOT EXISTS idx_crawl4ai_tasks_listing ON crawl4ai_tasks(listing_id);

-- Enable RLS but allow service role full access
ALTER TABLE crawl4ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl4ai_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read crawl4ai_jobs" ON crawl4ai_jobs FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read crawl4ai_tasks" ON crawl4ai_tasks FOR SELECT TO anon USING (true);
CREATE POLICY "Allow service role all crawl4ai_jobs" ON crawl4ai_jobs FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role all crawl4ai_tasks" ON crawl4ai_tasks FOR ALL TO service_role USING (true);
