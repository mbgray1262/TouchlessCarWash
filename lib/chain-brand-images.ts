/**
 * Brand-level hero images for chain car wash listings.
 *
 * Used when a listing has touchless_verified='chain' and hero_image_source != 'manual'.
 * A manually-approved location-specific photo always wins — this is the fallback.
 *
 * Keys match the `parent_chain` field on listings (set during chain import).
 * To update a brand photo: replace the URL here and redeploy.
 *
 * Photo requirements:
 *  - Shows the car wash tunnel/equipment clearly (not the gas station forecourt)
 *  - Landscape orientation, minimum 800×500px
 *  - Well-lit, no obstructions in the tunnel entrance
 */

const STORAGE = 'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/chain-brands';

export const CHAIN_BRAND_IMAGES: Record<string, string | string[]> = {
  // Holiday Stationstores car wash building exterior — from Rogers, MN location hero.
  // Hosted in Supabase (226 KB).
  'Holiday Stationstores': `${STORAGE}/holiday-stationstores.jpg`,

  // Kwik Trip car wash entrance building — red Kwik Trip fascia stripe, "CARWASH ENTRANCE" signage.
  // Hosted in Supabase (123 KB).
  'Kwik Trip': `${STORAGE}/kwik-trip.jpg`,

  // BellStores Touch Free tunnel image — hosted in Supabase (104 KB)
  'BellStores': `${STORAGE}/bellstores.png`,

  // H&S Energy Group brands — all use identical Istobal touchless equipment,
  // so they share the same 3 car wash photos rotated across listings.
  'Power Market': [
    `${STORAGE}/power-market.jpg`,
    `${STORAGE}/power-market-2.jpg`,
    `${STORAGE}/power-market-3.jpg`,
  ],
  'Extra Mile': [
    `${STORAGE}/power-market.jpg`,
    `${STORAGE}/power-market-2.jpg`,
    `${STORAGE}/power-market-3.jpg`,
  ],
  'Pinnacle 365': [
    `${STORAGE}/power-market.jpg`,
    `${STORAGE}/power-market-2.jpg`,
    `${STORAGE}/power-market-3.jpg`,
  ],

  // BP gas station canopy with BP sunflower logo — from Monee, IL location. 1600×900. Hosted in Supabase (251 KB).
  'BP': `${STORAGE}/bp.jpg`,

  // Elephant Car Wash — employee at car wash entrance, professional photo. Hosted in Supabase (314 KB).
  'Elephant Car Wash': `${STORAGE}/elephant-car-wash.jpg`,

  // Brown Bear Car Wash — building exterior with bear mascot signage. Hosted in Supabase (59 KB).
  'Brown Bear': `${STORAGE}/brown-bear.jpg`,

  // Gorilla Wash — facility exterior with Gorilla signage. Hosted in Supabase (261 KB).
  'Gorilla Wash': `${STORAGE}/gorilla-wash.jpg`,

  // Sheetz — 3 car wash photos rotated across listings for variety.
  'Sheetz': [
    `${STORAGE}/sheetz.jpg`,
    `${STORAGE}/sheetz-2.jpg`,
    `${STORAGE}/sheetz-3.jpg`,
  ],

  // Autowash — Colorado chain with 25 touchless locations. Reuses curated hero images
  // already uploaded for their top-rated locations (Central Park, Northfield, Fox Hill).
  'Autowash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/f8a6debf-14e9-4ed7-a8df-0fa2ca9a398c/hero-cropped-1774361829048.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/f4903a39-15d1-4bd7-9eeb-985ffc6f8114/hero-cropped-1774361278204.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/bf17ff39-817e-43f0-8808-dd3e4f41b0fb/place_photo_0_1772041185404.jpg',
  ],
};

/**
 * Returns the brand hero image URL for a chain listing, or null if none configured.
 * Returns null (not a placeholder) so callers can fall back to location-specific hero.
 *
 * When multiple images are configured for a chain, uses a hash of listingId
 * to deterministically assign one image per listing.
 */
/**
 * Returns the hero image URL for a chain page (always the first/only image).
 * Unlike getChainBrandImage which rotates per listing, this returns a single
 * consistent image for use as the chain page hero banner.
 */
export function getChainHeroImage(parentChain: string | null | undefined): string | null {
  if (!parentChain) return null;
  const entry = CHAIN_BRAND_IMAGES[parentChain];
  if (!entry) return null;
  return typeof entry === 'string' ? entry : entry[0];
}

export function getChainBrandImage(
  parentChain: string | null | undefined,
  listingId?: string,
): string | null {
  if (!parentChain) return null;
  const entry = CHAIN_BRAND_IMAGES[parentChain];
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  // Deterministic pick: parse first 8 hex chars of the UUID as an integer
  const hash = listingId ? parseInt(listingId.substring(0, 8), 16) || 0 : 0;
  return entry[hash % entry.length];
}
