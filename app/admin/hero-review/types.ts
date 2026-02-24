export type HeroSource = 'gallery' | 'google' | 'street_view' | 'website' | null;

export type FilterSource = 'all' | 'gallery' | 'google' | 'street_view' | 'website' | 'none';

export interface HeroListing {
  id: string;
  name: string;
  city: string;
  state: string;
  hero_image: string | null;
  hero_image_source: HeroSource;
  photos: string[] | null;
  google_photo_url: string | null;
  street_view_url: string | null;
  website: string | null;
  photo_enrichment_attempted_at: string | null;
  flagged?: boolean;
}

export type ReplacementSpecial = 'use_placeholder' | 'remove_hero';

export interface ReplacementOption {
  url: string;
  label: string;
  source: string;
}

export interface SessionStats {
  replacements: number;
  flagged: number;
}
