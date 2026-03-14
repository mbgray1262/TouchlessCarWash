export type HeroSource = 'gallery' | 'google' | 'street_view' | 'website' | null;

export type FilterSource = 'all' | 'gallery' | 'google' | 'street_view' | 'website' | 'none';

export interface HeroListing {
  id: string;
  name: string;
  address: string | null;
  city: string;
  state: string;
  slug: string | null;
  hero_image: string | null;
  hero_image_source: HeroSource;
  photos: string[] | null;
  google_photo_url: string | null;
  street_view_url: string | null;
  website: string | null;
  photo_enrichment_attempted_at: string | null;
  equipment_brand: string | null;
  equipment_model: string | null;
  flagged?: boolean;
}

export const EQUIPMENT_BRANDS = [
  { value: 'pdq', label: 'PDQ (LaserWash)' },
  { value: 'washworld', label: 'WashWorld' },
  { value: 'belanger', label: 'Belanger' },
  { value: 'ryko', label: 'Ryko' },
  { value: 'istobal', label: 'Istobal' },
  { value: 'ds', label: 'D&S' },
  { value: 'petit', label: 'Petit AutoWash' },
  { value: 'oasis', label: 'Oasis' },
  { value: 'mark_vii', label: 'Mark VII' },
  { value: 'karcher', label: 'Kärcher' },
  { value: 'autec', label: 'Autec' },
  { value: 'saber', label: 'Saber' },
  { value: 'broadway', label: 'Broadway' },
  { value: 'other', label: 'Other' },
] as const;

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
