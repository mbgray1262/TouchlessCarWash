export type HeroSource = 'gallery' | 'google' | 'street_view' | 'website' | 'chain_brand' | 'manual' | null;

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
  parent_chain: string | null;
  photos: string[] | null;
  google_photo_url: string | null;
  street_view_url: string | null;
  website: string | null;
  photo_enrichment_attempted_at: string | null;
  google_place_id: string | null;
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
  { value: 'coleman_hanna', label: 'Coleman Hanna' },
  { value: 'broadway', label: 'Broadway' },
  { value: 'hydrospray', label: 'Hydro-Spray' },
  { value: 'dencar', label: 'Dencar Technology' },
  { value: 'ns_corp', label: 'NS Corporation' },
  { value: 'maxar', label: 'MAXAR' },
  { value: 'washman', label: 'Washman' },
  { value: 'super_wash', label: 'Super Wash' },
  { value: 'nustar', label: 'Nu+Star (NuStar)' },
  { value: 'delta_sonic', label: 'Delta Sonic' },
  { value: 'futura', label: 'Futura' },
  { value: 'other', label: 'Other' },
] as const;

/** Common models per brand — shown as dropdown options. "Other" allows free-text entry. */
export const EQUIPMENT_MODELS: Record<string, string[]> = {
  pdq: ['LaserWash', 'LaserWash 360', 'LaserWash 360 Plus', 'LaserWash 4000', 'LaserWash G5', 'LaserWash M5', 'LaserWash Sentry', 'ProTouch', 'Tandem Surfline', 'Access', 'SoftGloss XS'],
  washworld: ['Razor', 'Razor Double Barrel', 'Razor Edge', 'Razor Touch', 'Razor XR', 'Profile', 'Profile Max', 'High Velocity'],
  belanger: ['Kondor', 'Kondor KL2', 'Eclipse', 'FreeStyler', 'SpinLite', 'Vector', 'Saber'],
  ryko: ['SoftGloss', 'SoftGloss Maxx', 'Radius'],
  istobal: ['M\'NEX', 'M\'NEX 22', 'M\'NEX 25', 'M\'NEX 32', 'ISTOBAL 1900', 'FLEX 5'],
  ds: ['IQ 2.0 Touch Free', 'IQ Touch Free', 'IQ 2.0', 'IQ 2.0 Genius Series', '5000', 'Carwash Systems'],
  petit: ['Accutrac 360i', 'Accutrac 360t', 'Accutrac Mini'],
  oasis: ['Typhoon', 'Eclipse', 'Kwik Wash', 'XR-1000', 'XP'],
  mark_vii: ['ChoiceWash XT', 'ChoiceWash CT', 'AquaJet', 'SoftLine'],
  karcher: ['CWB 3', 'CB 1/28', 'CB 2/28', 'CB 3/32', 'Opti 6000 Professional', 'Opti 8000'],
  autec: ['Evolution', 'EV-1 Evolution', 'AES-425', 'Express Automatic'],
  coleman_hanna: ['Water Wizard 2.0'],
  broadway: ['Wonder Bar'],
  hydrospray: ['In Bay Automatic (IBA)'],
  dencar: ['Dynawash Express'],
  ns_corp: [],
  maxar: [],
  washman: [],
  super_wash: ['Supermatic', 'Supermatic II'],
  nustar: ['Comet', 'Super Comet'],
  delta_sonic: ['Custom Tunnel'],
  futura: ['Revolution'],
  other: ['CROSSFIRE'],
};

/**
 * Canonicalize (brand, model) for equipment tagging.
 *
 * The AI classifier (classify-batch, classify-one, detect-equipment) and ad-hoc
 * admin typing both historically produced case-variant and near-duplicate entries
 * ("laserwash 360 plus" vs "LaserWash 360 Plus" vs "LaserWash (model unclear)")
 * that cluttered the equipment-model dropdown and split listing counts across
 * duplicate brand pages. Every write path now routes through this function so
 * the stored values always match one canonical entry per real model.
 *
 * Brand: case-insensitive match against EQUIPMENT_BRANDS slugs; non-matches are
 * normalized to lowercase snake_case so the vocabulary hook renders a clean label.
 *
 * Model: case-insensitive match against that brand's known models. Falls back to
 * stripping parenthetical hedging like "(model uncertain)" and retrying, then
 * returns the trimmed input unchanged for genuinely novel models.
 */
export function canonicalizeEquipmentBrand(brand: string | null | undefined): string | null {
  if (!brand) return null;
  const t = brand.trim();
  if (!t) return null;
  // Case-insensitive match against known slugs or labels.
  const tl = t.toLowerCase();
  for (const b of EQUIPMENT_BRANDS) {
    if (b.value.toLowerCase() === tl || b.label.toLowerCase() === tl) return b.value;
  }
  // Non-canonical brand: lowercase snake_case for a consistent custom label.
  const slug = t.toLowerCase().replace(/\s+/g, '_').replace(/&/g, '').replace(/-/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return slug || null;
}

export function canonicalizeEquipmentModel(
  brand: string | null | undefined,
  model: string | null | undefined,
): string | null {
  if (!model) return null;
  let t = model.trim();
  if (!t) return null;
  // Fix "High. Velocity"-style typos (period followed by space in the middle).
  t = t.replace(/\.\s+/g, ' ');
  const candidates = brand ? (EQUIPMENT_MODELS[brand] ?? []) : [];
  // 1) Full-string case-insensitive match (preserves parenthetical canonicals
  //    like "In Bay Automatic (IBA)" where the parens are part of the name).
  for (const known of candidates) {
    if (known.toLowerCase() === t.toLowerCase()) return known;
  }
  // 2) Strip AI-hedging parentheticals ("(model uncertain)", "(model unclear)")
  //    and retry the canonical match; this collapses "LaserWash (model unclear)"
  //    onto plain "LaserWash".
  const stripped = t.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (stripped && stripped !== t) {
    for (const known of candidates) {
      if (known.toLowerCase() === stripped.toLowerCase()) return known;
    }
    return stripped;
  }
  return t;
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
