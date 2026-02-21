export interface PipelineStats {
  queue: number;
  scraped: number;
  classified: number;
  touchless: number;
  not_touchless: number;
  failed: number;
  redirects: number;
  total_with_websites: number;
}

export interface PipelineBatch {
  id: string;
  firecrawl_job_id: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total_urls: number;
  completed_count: number;
  failed_count: number;
  credits_used: number;
  chunk_index: number;
  created_at: string;
  updated_at: string;
  classify_status: 'running' | 'completed' | 'failed' | 'expired' | 'abandoned' | null;
  classified_count: number;
  classify_started_at: string | null;
  classify_completed_at: string | null;
}

export interface PipelineRun {
  id: string;
  crawl_status: string;
  is_touchless: boolean | null;
  touchless_evidence: string | null;
  images_found: number;
  processed_at: string;
  listing: { name: string; website: string } | null;
}

export interface PipelineStatusResponse {
  stats: PipelineStats;
  batches: PipelineBatch[];
  recent_runs: PipelineRun[];
}
