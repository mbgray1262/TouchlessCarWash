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

/** Common models per brand — shown as dropdown options. "Other" allows free-text entry. */
export const EQUIPMENT_MODELS: Record<string, string[]> = {
  pdq: ['LaserWash 360', 'LaserWash 360 Plus', 'LaserWash 4000', 'LaserWash Sentry', 'ProTouch', 'Access'],
  washworld: ['Razor', 'Razor Edge', 'Razor Touch', 'Razor XR', 'Profile'],
  belanger: ['Kondor', 'FreeStyler', 'SpinLite', 'Vector'],
  ryko: ['SoftGloss', 'SoftGloss Maxx', 'Radius'],
  istobal: ['M\'NEX 22', 'M\'NEX 25', 'M\'NEX 32', 'ISTOBAL 1900'],
  ds: ['Carwash Systems'],
  petit: ['Accutrac 360i', 'Accutrac 360t', 'Accutrac Mini'],
  oasis: ['Typhoon', 'XR-1000'],
  mark_vii: ['ChoiceWash XT', 'ChoiceWash CT', 'AquaJet', 'SoftLine'],
  karcher: ['CWB 3', 'CB 1/28', 'CB 2/28', 'CB 3/32'],
  autec: ['Evolution', 'EV-1 Evolution', 'AES-425', 'Express Automatic'],
  saber: [],
  broadway: [],
  other: [],
};

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
