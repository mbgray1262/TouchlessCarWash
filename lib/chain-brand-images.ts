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

  // Brown Bear Car Wash — 3 curated photos from top-rated Seattle, Tacoma, Spokane locations.
  // The previous single /chain-brands/brown-bear.jpg had a bad crop (only showed sky + roof).
  'Brown Bear': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/00cc36c7-ee6d-4d60-9c33-85c2afbb8deb/hero-cropped-1775050825841.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/c106128f-3fb9-4287-b2c2-0972b6d5572d/hero-cropped-1775050705191.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/abae0261-2d2f-4b32-bc28-804cc7abd24b/hero-cropped-1774915872558.png',
  ],

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

  // Super Wash — 102 locations across 18 states. Reuses curated location hero images.
  'Super Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/fe4a2837-95b3-44bb-923f-b460cdc5027b/hero-cropped-1773594478645.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/12d58166-8c14-4321-a56a-f3cb03e3b78c/upload-1774101912034.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/6a90b3f6-3c91-465f-9a69-79daa02b1754/google_photo.jpg',
  ],

  // Splash Car Wash — 59 locations across CT/NY/VT. All photos verified brush-free &
  // no hand-washing imagery (critical for touchless positioning).
  'Splash Car Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/5a5d1bdb-4c28-4868-989c-66fdb178852c/google-1773923619267.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/1be264c3-5d6e-470d-9452-b2dd07faec4e/google-1773923639025.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/4790046a-6835-4270-b91c-396165a32ecb/google-1773923629097.jpg',
  ],

  // Delta Sonic — 34 locations across IL/NY/PA.
  'Delta Sonic': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/a009fbfe-a899-4ee7-bd48-bd4a39f64e05/google-1773922529441.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/5fcd4cdd-fe49-4173-92d1-c98bcdb29abc/hero-cropped-1773321507713.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/f84d785d-9b54-49f2-9aed-04ae0393ea32/web_0_1772825416731.jpg',
  ],

  // Drive & Shine — 18 locations across IN/MI with incredibly high ratings (4.9 avg).
  'Drive & Shine': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/c7785252-3cc7-4459-8072-43d1f24c29fe/hero-cropped-1774231070115.png',
    'https://lh3.googleusercontent.com/p/AF1QipPSv8yEE9AFTldrNS4oTvArjnnVidDeyVCh880P=w1600-h1200',
    'https://lh3.googleusercontent.com/p/AF1QipO2GcHWJkkEdzl55im2LTsr720ZjPv7nVNklnDV=w1600-h1200',
  ],

  // Phase 3 — Tier 2 regional chains. Hero images pulled from top-rated listings per chain.
  'Prestige Car Wash': [
    'https://lh3.googleusercontent.com/p/AF1QipM9AsvjiSz_T8ht6sO2SbIk_qgUMVYJWXasu4J7=w1600-h1200',
    'https://lh3.googleusercontent.com/p/AF1QipN9xVcHv-nCmj8_FwAIuMYOL33T0x7_BeJIpDmZ=w1600-h1200',
    'https://lh3.googleusercontent.com/p/AF1QipOUxk1zyHN13AdewwiAwqcIVuU-HfQOaPxMkvC8=w1600-h1200',
  ],
  'Flagstop Car Wash': [
    'https://lh3.googleusercontent.com/p/AF1QipPITO9VbG0Ga-Qd6MUIC1Xfxbd96bP8z3xSazcU=w1600-h1200',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/c693d734-b6ab-4e93-87f9-9880d417c70d/google-1773935527664.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/4a189039-00ae-4722-95f6-4e9eb5976110/google-1773922668875.png',
  ],
  'Mr. Magic Car Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/fa0816ec-5eb3-4e8d-857c-35a2fd236196/upload-1774027117081.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/066caa73-68f5-4afe-851f-bf3923a59761/upload-1774027950773.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/39bffbed-bfaa-4a03-acbe-1f91bbf2c032/upload-1774027315466.jpg',
  ],
  "Zappy's Auto Washes": [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/3b63f9b9-d701-4a78-a2c5-f17346bb9641/upload-1774093268722.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/60ccf86e-9465-4788-9e88-79b7b30c386a/upload-1774093721874.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/2b1c1c5f-b238-4557-9d03-d31fd30deaeb/upload-1774091980898.jpg',
  ],
  'Rocky Mountain Car Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/ee3805f6-2d52-4380-8f4d-e7a63a520739/google-1773923343579.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/46153ddf-4395-48d5-a59f-2c6c38685c30/gallery_bp_0_1772648346260.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/07c7b0f2-4b52-46c4-98c3-13271f6f1481/hero-cropped-1774144058055.png',
  ],
  'Foam & Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/65bd65c2-c4f1-4481-8c66-b8dab64a9c14/web_0_1772814556052.webp',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/fc9abf35-0e87-42c0-ace2-e66b129bf43f/google-1773922687033.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/ed565c6a-d23c-4e66-8b83-3f7d2d591d17/web_0_1772814769704.webp',
  ],
  'Blue Tide Car Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/e44b5a06-a728-4dd6-a706-4a1d09945172/place_photo_2_1774924491661.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/ab2d3a29-9e35-4639-b515-88abfda98ccf/upload-1774012699397.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/88d1b031-5943-4925-b378-a6701662dd91/hero-cropped-1774981230049.jpg',
  ],
  'Salty Dog Car Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/d054a157-420f-41f9-80e3-f313c27ec7ec/hero-cropped-1773280132659.webp',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/2cc506fb-9d7e-4f69-b764-3104264782f9/hero-cropped-1773660323627.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/8f5845e2-9800-4fa6-824a-78caed39800e/hero-cropped-1773326071740.jpg',
  ],
  'Auto Spa Speedy Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/6c06dc6a-9f25-47c2-b735-0668ab0d0d57/hero-cropped-1774177718051.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/5bec5767-f3e1-4772-8e73-91890153896b/hero-cropped-1774178732803.png',
    'https://lh3.googleusercontent.com/p/AF1QipMLGEqqke-a9ggi4MjmOxpRvIbW8gxCXQpq2z2P=w1600-h1000-k-no',
  ],
  'Hy-Vee': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/2c3f9e77-63f9-4809-9846-a9354e06662d/hero-cropped-1774215816336.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/faf087fd-8db8-4602-8bd4-aa8c2b6e280f/google-1773922838353.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/30b2494e-b811-4cb7-99b8-b3a97d9efc1b/google-1773922845368.jpg',
  ],
  // Terrible's — St Rose Pkwy exterior (TERRIBLE'S branded), Lexus in touchless
  // bay under illuminated "TERRIBLE'S" sign (user-provided), touchless gantry POV.
  "Terrible's": [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/4112dad5-5e98-40a8-b69d-78a3ec9fd403/google-1774647875466.jpg',
    `${STORAGE}/terribles-lexus.jpg`,
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/9c55115c-2f45-463d-a27d-452a2665149f/hero-cropped-1774142263324.png',
  ],
  'Dirtbuster Car Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/2d2e7b66-e6e9-4578-8aaa-47d026f264c9/google-1773922550408.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/268bf870-ba4d-44bc-90bb-1488d44da13e/google-1773922547021.jpg',
    'https://lh3.googleusercontent.com/p/AF1QipMo5b74-7A0L5Giv4sPQzw4xijZTtuArpViyt22=w1600-h1200',
  ],
  'ProClean Auto Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/d73b0727-1450-4c66-a76d-348399e8a939/hero-cropped-1773267863825.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/3f5706c6-bef0-4038-8c38-b6135569a2c8/hero-cropped-1774364755462.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/7be73833-0355-4fdb-9ef7-e6b1b5d787e4/hero-cropped-1774365817892.png',
  ],
  'Power Wash USA': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/271cee76-4839-47d6-a9fb-cd08094bf310/gallery_bp_0_1772705782191.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/39ba5ea4-ad25-49b4-aff3-371a1324cde1/google-1773923237560.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/afa98633-da37-4f03-890f-d519e2b31879/google-1773923238588.jpg',
  ],
  // IQ Car Wash — IQ offers BOTH touchless + soft-touch at every location, so almost
  // every building photo shows "SOFT TOUCH" signage prominently. Only clean option
  // is a close-up of a "TOUCH FREE" bay entrance (Wichita Falls).
  'IQ Car Wash': 'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/3b460353-53e6-46d4-96b8-85f1e3f62955/google-1773942594703.jpg',
  // Cascade Car Wash — Tesla Cybertruck in touchless bay (premium touchless
  // demonstration; Cybertruck's stainless steel finish requires brush-free wash).
  'Cascade Car Wash': `${STORAGE}/cascade-cybertruck.webp`,

  'Royal Rinse Car Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/f9583b81-9d91-4120-8b7b-099a50194659/place_photo_0_1772732053037.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/ec643f4b-6d3d-4842-b7a5-0d1d787e1c5e/google-1773923354877.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/cea4d5c4-00ff-4a16-a9a3-fe313aa7c1ba/upload-1774115360119.png',
  ],

  // Splash'n Shine — 4 AZ locations (Gilbert, Chandler, Phoenix, Gold Canyon).
  "Splash'n Shine": [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/38d8b544-16e8-45ce-94e3-ba82b3c2900c/hero-cropped-1774284226935.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/e623f3ae-cfe5-49a7-af79-d68b21442260/hero-cropped-1774380443540.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/c3c40946-94cc-4367-8c63-7707e6bcc3e7/place_photo_0_1772041598446.jpg',
  ],

  // Wooly Wash — 12 southern IL locations.
  'Wooly Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/0be455a1-4c14-4f28-ab93-62016ab72db8/place_photo_0_1774922757718.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/b67c834c-ff5a-4fa5-a760-af495b9e3662/gallery_bp_0_1771873727795.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/ff0e4e33-6ac2-43d8-9413-6c5a98a36c15/gallery_bp_0_1771873869284.jpg',
  ],

  // Jurassic Car Wash — 4 TX locations. Austin Google photo REMOVED (it showed
  // spinning blue brushes — critical policy violation). Using 3 brush-free
  // Potranco location photos.
  'Jurassic Car Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/c3989e47-b6ad-444d-ab93-ede366c4a4fd/google-1773942002217.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/c3989e47-b6ad-444d-ab93-ede366c4a4fd/google-1773764179574.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/c3989e47-b6ad-444d-ab93-ede366c4a4fd/google-1773764319901.jpg',
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
