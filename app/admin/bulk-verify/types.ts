export type VerificationStatus =
  | 'unverified'
  | 'crawl_pending'
  | 'crawled'
  | 'crawl_failed'
  | 'auto_classified'
  | 'approved'
  | 'rejected';

export type ClassificationLabel =
  | 'confirmed_touchless'
  | 'likely_touchless'
  | 'not_touchless'
  | 'uncertain';

export interface PipelineListing {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  website: string | null;
  parent_chain: string | null;
  verification_status: VerificationStatus;
  crawl_status: string | null;
  crawl_notes: string | null;
  is_touchless: boolean | null;
  touchless_confidence: string | null;
  classification_confidence: number | null;
  classification_source: string | null;
  touchless_evidence: Array<{ keyword: string; snippet: string; type: string }> | null;
  hero_image: string | null;
  logo_url: string | null;
  photos: string[];
  blocked_photos: string[] | null;
  amenities: string[];
  is_approved: boolean;
  last_crawled_at: string | null;
}

export interface DashboardStats {
  unverified: number;
  awaiting_classification: number;
  auto_classified: number;
  name_matched: number;
  approved: number;
  crawl_failed: number;
  chains: number;
  standalone: number;
  total: number;
}

export interface CrawlProgress {
  running: boolean;
  current: number;
  total: number;
  currentName: string;
  done: number;
  failed: number;
  batchIds: string[];
}

export interface ClassifyProgress {
  running: boolean;
  current: number;
  total: number;
  currentName: string;
  done: number;
  failed: number;
}
