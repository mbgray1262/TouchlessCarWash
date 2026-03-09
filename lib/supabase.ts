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
  touchless_wash_types: string[] | null;
  equipment_brand: string | null;
  equipment_model: string | null;
  extracted_data: {
    service_types?: string[];
    wash_packages?: Array<{ name: string; price?: string; features?: string[] }>;
    membership_plans?: Array<{ name: string; price?: string; features?: string[] }>;
    equipment_technology?: string[];
    special_features?: string[];
    payment_methods?: string[];
    amenities_detailed?: string[];
    hours_notes?: string[];
    review_highlights?: string[];
    unique_selling_points?: string[];
  } | null;
  sentiment_score: number | null;
  sentiment_themes: { positive: string[]; negative: string[] } | null;
  sentiment_summary: string | null;
  sentiment_analyzed_at: string | null;
};

// Columns needed by ListingCard — avoids fetching heavy fields like description,
// google_about, popular_times, reviews_per_score, wash_packages, photos, etc.
export const LISTING_CARD_COLUMNS = 'id, name, slug, city, state, address, phone, rating, review_count, hero_image, google_photo_url, street_view_url, logo_photo, google_logo_url, amenities, touchless_wash_types, extracted_data, hours, is_touchless, is_featured' as const;

export type Review = {
  id: string;
  listing_id: string;
  author_name: string;
  rating: number;
  comment: string;
  created_at: string;
};

export type ReviewSnippet = {
  id: string;
  listing_id: string;
  reviewer_name: string | null;
  rating: number | null;
  review_text: string;
  review_date: string | null;
  iso_date: string | null;
  review_id: string | null;
  touchless_keywords: string[];
  is_touchless_evidence: boolean;
  source: string;
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
  submitter_email: string | null;
  ip_address: string | null;
  notes: string | null;
  photos: string[] | null;
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
