/*
  # Clear hero_image where chain-brand fallback URL was persisted

  ## Context
  An older backfill script wrote chain-brand fallback URLs directly into the
  `hero_image` column for listings whose source was tagged 'chain-brand' or
  'chain_brand'. That's a data bug — the chain fallback is supposed to be
  resolved at runtime by getChainBrandImage() so that updating the rotation
  in lib/chain-brand-images.ts immediately re-routes every listing. With
  the URL baked in, those listings stayed pinned to the OLD fallback even
  after the rotation was refreshed.

  Symptom: 53 Super Wash listings were still rendering a low-res
  "BUCKEYE SUPER WASH" tunnel photo (the previous rotation's first slot,
  retired 2026-04-25) even though the new blue-overhang rotation was live.

  ## Fix
  For every listing where hero_image_source ∈ ('chain-brand','chain_brand'):
    - Set hero_image = NULL
    - Set hero_image_source = NULL
  This forces the runtime resolver back to getChainBrandImage(parent_chain,
  id), which picks from the current rotation deterministically by listing
  id hash.

  Listings with hero_image_source = 'manual' are NOT touched — those are
  owner-curated and the owner can re-pick if they want to.

  ## Scope
  Filter is on hero_image_source, not on the specific bad URL, so this also
  fixes any other chain whose fallback got baked in the same way (Power
  Market, Holiday, etc. — same pattern, same buggy backfill).
*/

UPDATE listings
SET hero_image = NULL,
    hero_image_source = NULL
WHERE hero_image_source IN ('chain-brand', 'chain_brand')
  AND hero_image IS NOT NULL;
