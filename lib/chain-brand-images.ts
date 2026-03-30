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
  // TODO: Replace placeholder URLs with actual brand photos once sourced.
  // Recommended sources: official chain website, press kit, or best manual-approved
  // photo from any location in this chain.

  'Holiday Stationstores': '',   // Touch Free tunnel — source from circlek.com car wash page
  'Power Market':           '',   // Touch Free drive-through — source from pwrmarket.com
  'Kwik Trip':              '',   // Touch Free tunnel — source from kwiktrip.com car wash page
  'BellStores':             '',   // Touch Free wash — source from bellstores.com car wash page
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
