import { supabase } from './supabase';

export interface CrawlJobConfig {
  url: string;
  maxDepth?: number;
  limit?: number;
  includePaths?: string[];
  excludePaths?: string[];
  extractSchema?: Record<string, any>;
}

export interface CrawlJob {
  id: string;
  job_id: string;
  url: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  crawl_config: Record<string, any>;
  results: Array<any>;
  results_count: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export const defaultCarWashExtractSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "The name of the car wash business"
    },
    address: {
      type: "string",
      description: "Street address of the car wash"
    },
    city: {
      type: "string",
      description: "City where the car wash is located"
    },
    state: {
      type: "string",
      description: "State abbreviation (e.g., CA, NY)"
    },
    zip: {
      type: "string",
      description: "ZIP code"
    },
    phone: {
      type: "string",
      description: "Phone number"
    },
    website: {
      type: "string",
      description: "Website URL"
    },
    hours: {
      type: "object",
      description: "Operating hours by day of week"
    },
    packages: {
      type: "array",
      description: "Available wash packages with names and prices",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          price: { type: "string" },
          description: { type: "string" }
        }
      }
    },
    amenities: {
      type: "array",
      description: "Available amenities (e.g., 'Free Vacuums', 'Touchless', 'Self-Service')",
      items: { type: "string" }
    },
    latitude: {
      type: "number",
      description: "Latitude coordinate"
    },
    longitude: {
      type: "number",
      description: "Longitude coordinate"
    }
  },
  required: ["name", "address"]
};

export async function startCrawl(config: CrawlJobConfig): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/start-crawl`;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to start crawl');
    }

    return {
      success: true,
      jobId: data.jobId,
    };
  } catch (error) {
    console.error('Error starting crawl:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getCrawlJobs(): Promise<CrawlJob[]> {
  const { data, error } = await supabase
    .from('crawl_jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching crawl jobs:', error);
    return [];
  }

  return data as CrawlJob[];
}

export async function getCrawlJobById(id: string): Promise<CrawlJob | null> {
  const { data, error } = await supabase
    .from('crawl_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching crawl job:', error);
    return null;
  }

  return data as CrawlJob;
}

export async function getCrawlJobByJobId(jobId: string): Promise<CrawlJob | null> {
  const { data, error } = await supabase
    .from('crawl_jobs')
    .select('*')
    .eq('job_id', jobId)
    .single();

  if (error) {
    console.error('Error fetching crawl job:', error);
    return null;
  }

  return data as CrawlJob;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'running':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'failed':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
