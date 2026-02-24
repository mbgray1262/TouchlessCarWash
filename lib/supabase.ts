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
  google_photo_url: string | null;
  google_logo_url: string | null;
  street_view_url: string | null;
  google_photos_count: number | null;
  google_description: string | null;
  google_about: Record<string, unknown> | null;
  google_subtypes: string | null;
  google_category: string | null;
  business_status: string | null;
  is_google_verified: boolean | null;
  reviews_per_score: Record<string, number> | null;
  popular_times: unknown | null;
  typical_time_spent: string | null;
  price_range: string | null;
  booking_url: string | null;
  google_maps_url: string | null;
  google_id: string | null;
  google_place_id: string | null;
  description: string | null;
  description_generated_at: string | null;
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

export type Vendor = {
  id: number;
  canonical_name: string;
  domain: string | null;
  website: string | null;
  logo_url: string | null;
  description: string | null;
  is_chain: boolean;
  created_at: string;
  updated_at: string;
};

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  category: string | null;
  meta_title: string | null;
  meta_description: string | null;
  featured_image_url: string | null;
  tags: string[] | null;
  status: 'draft' | 'published';
  author: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
