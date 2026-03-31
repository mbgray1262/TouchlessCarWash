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

export const CHAIN_BRAND_IMAGES: Record<string, string> = {
  // Source: circlek.com/us/holiday-station/car-wash (header image)
  'Holiday Stationstores': 'https://www.circlek.com/sites/default/files/2024-05/car_wash_header_002-min.png',

  // Source: best available photo from Redding, CA Power Market (stored in Supabase)
  'Power Market': 'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/93883d70-f945-4bdb-8fb9-e238e6f4d85b/google-1774913769885.jpg',

  // Source: kwiktrip.com/carwash (hero image)
  'Kwik Trip': 'https://www.kwiktrip.com/wordpress/wp-content/uploads/2024/01/CarWash_Hero.jpg',

  // Source: bellstores.com/home/our-stores/car-wash (Touch Free specific image)
  'BellStores': 'https://bellstores.com/assets/Uploads/touch-free-v2__ScaleWidthWzExNzBd.png',
};

/**
 * Returns the brand hero image URL for a chain listing, or null if none configured.
 * Returns null (not a placeholder) so callers can fall back to location-specific hero.
 */
export function getChainBrandImage(parentChain: string | null | undefined): string | null {
  if (!parentChain) return null;
  const url = CHAIN_BRAND_IMAGES[parentChain];
  return url || null;
}
