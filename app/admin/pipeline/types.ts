export interface ClassifyStats {
  total: number;
  touchless: number;
  not_touchless: number;
  no_website: number;
  fetch_failed: number;
  classify_failed: number;
  unknown: number;
  null_result: number;
  never_attempted: number;
  other_unclassified: number;
  unclassified_with_website: number;
}

export interface RecentListing {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  is_touchless: boolean | null;
  touchless_evidence: string | null;
  last_crawled_at: string | null;
  website: string | null;
  crawl_status: string | null;
}

export interface QueueListing {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  website: string;
}

export interface LogEntry {
  listing_id: string;
  name: string;
  city: string | null;
  state: string | null;
  website: string;
  status: 'touchless' | 'not_touchless' | 'unknown' | 'fetch_failed' | 'classify_failed' | 'already_classified';
  evidence?: string;
}
