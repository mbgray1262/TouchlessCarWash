import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Listing = {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  website: string | null;
  hours: Record<string, string> | null;
  wash_packages: Array<{ name: string; price: string; description?: string }>;
  amenities: string[];
  photos: string[];
  rating: number;
  review_count: number;
  is_approved: boolean;
  is_featured: boolean;
  is_touchless: boolean | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  hero_image: string | null;
  logo_photo: string | null;
  parent_chain: string | null;
  blocked_photos: string[] | null;
};

export type Review = {
  id: string;
  listing_id: string;
  author_name: string;
  rating: number;
  comment: string;
  created_at: string;
};

export type Submission = {
  id: string;
  business_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  website: string | null;
  hours: string | null;
  wash_packages: string | null;
  amenities: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  category: string | null;
  published_at: string;
};
