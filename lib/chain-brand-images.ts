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

export const CHAIN_BRAND_IMAGES: Record<string, string> = {
  // Holiday/Circle K car wash building exterior at dusk — red & tan brand colors, "EXIT CAR WASH" signage visible.
  // Architectural photo of Ledgeview WI location. Hosted in Supabase (565 KB).
  'Holiday Stationstores': `${STORAGE}/holiday-stationstores.png`,

  // Kwik Trip car wash entrance building — red Kwik Trip fascia stripe, "CARWASH ENTRANCE" signage.
  // Hosted in Supabase (123 KB).
  'Kwik Trip': `${STORAGE}/kwik-trip.jpg`,

  // BellStores Touch Free tunnel image — hosted in Supabase (104 KB)
  'BellStores': `${STORAGE}/bellstores.png`,

  // Power Market: no branded car wash photo available (website has video only, no tunnel photos).
  // Listings fall back to per-location Google photo or street view.

  // BP gas station canopy with BP sunflower logo — from Monee, IL location. 1600×900. Hosted in Supabase (251 KB).
  'BP': `${STORAGE}/bp.jpg`,
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
