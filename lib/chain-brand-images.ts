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
  // Hosted in Supabase (226 KB). Most Holiday locations were rebranded to Circle K
  // after the 2017 acquisition, but the building exteriors are largely the same.
  'Holiday Stationstores': `${STORAGE}/holiday-stationstores.jpg`,

  // Circle K — acquired Holiday Stationstores in 2017 and rebranded most locations.
  // Rotation of 3 manually curated hero crops from high-rated Circle K car washes.
  // Fresno CA is the most established (4★ × 407 reviews); Grand Forks and Rochester
  // are Michael-uploaded crops from former-Holiday locations now under Circle K signage.
  'Circle K': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/feccec8c-8628-4a2c-9315-5492a6d0792d/hero-cropped-1774366441942.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/37375a60-4262-4464-a3b0-b3eb08d4832b/hero-cropped-1776786063396.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/8671e396-93ea-4e08-8a88-b74f18ca29a5/hero-cropped-1776786123461.jpg',
  ],

  // Kwik Trip — rotation of 4 clean exterior photos, all touchless bays visible
  // without the problematic "SOFT TOUCH" signage from the previous single image.
  // Previous fallback /chain-brands/kwik-trip.jpg showed "Touch Free OR Soft Touch"
  // which could confuse users on our touchless-only directory.
  'Kwik Trip': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/370cc967-f39d-4804-bd7d-4a05552126e7/hero-cropped-1774973708483.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/c6daf1fb-a229-438a-b45b-4516750d74dd/hero-cropped-1774973046421.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/dce69812-e998-4ee1-a0ae-6b4ec52ba2f2/hero-cropped-1774980731630.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/66af98d7-e91c-488a-a2cd-a13a5d64b5db/hero-cropped-1775158076683.jpg',
  ],

  // BellStores Touch Free tunnel image — hosted in Supabase (104 KB)
  'BellStores': `${STORAGE}/bellstores.png`,

  // H&S Energy Group brands + Max Car Wash — all use identical Istobal
  // touchless equipment. Rotation is the verified brush-free Istobal bays
  // from Extra Mile Roseville CA + Santa Monica CA plus Max Car Wash's
  // manually-curated South Florida Istobal crops.
  //
  // Previous rotation (chain-brands/power-market.jpg, -2, -3) was retired
  // 2026-04-24: one frame showed red contact rollers down the tunnel and
  // another was a generic stock wheel/foam close-up that did not represent
  // a touchless bay. Both violated our touchless-only imagery policy.
  'Power Market': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/48edea94-bbc4-47f5-afa5-1cc1636e037a/hero-cropped-1776872848735.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/ce6819ff-909d-412f-9298-af459856bb12/hero-cropped-1776785254452.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/434b7f44-44e0-403d-8aa4-c1c0a786c9d7/hero-cropped-1776785359127.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/17ff3edc-cae0-4860-80e3-d30b0eeb2f19/hero-cropped-1776785397794.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/9cbb8ecf-dd5d-418f-b05c-0e026b02a306/hero-cropped-1776785418546.jpg',
  ],
  'Extra Mile': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/48edea94-bbc4-47f5-afa5-1cc1636e037a/hero-cropped-1776872848735.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/ce6819ff-909d-412f-9298-af459856bb12/hero-cropped-1776785254452.jpg',
  ],
  // Kelley's Market — every Kelley's car wash is a PDQ LaserWash (touch-free),
  // per kelleysmarket.com/the-market/car-wash. Most locations are gas-station
  // forecourts where auto-hero can't isolate the wash bay, so we fall back to a
  // rotation of two real, AI-screened Kelley's LaserWash photos (Cortland +
  // Sterling IL). Replace these URLs to update the brand photo.
  "Kelley's Market": [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/e8657e82-047f-497f-88e8-d62bf6625a9b/0.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/b9e549ab-99e5-4c04-b9b7-38ca105d8a48/0.jpg',
  ],
  'Pinnacle 365': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/48edea94-bbc4-47f5-afa5-1cc1636e037a/hero-cropped-1776872848735.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/ce6819ff-909d-412f-9298-af459856bb12/hero-cropped-1776785254452.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/434b7f44-44e0-403d-8aa4-c1c0a786c9d7/hero-cropped-1776785359127.jpg',
  ],
  // Max Car Wash — South Florida operator of Chevron/Marathon/Shell/Exxon/Mobil
  // branded locations, most with Istobal touchless equipment (same family as
  // H&S Energy's Power Market). Rotation uses the same verified-brush-free
  // Istobal crops above plus Max's own Roseville curates.
  'Max Car Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/434b7f44-44e0-403d-8aa4-c1c0a786c9d7/hero-cropped-1776785359127.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/17ff3edc-cae0-4860-80e3-d30b0eeb2f19/hero-cropped-1776785397794.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/9cbb8ecf-dd5d-418f-b05c-0e026b02a306/hero-cropped-1776785418546.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/6c7a1548-bb34-4e13-802d-904c32c84bd8/hero-cropped-1776785438558.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/95960139-673f-4eff-9f7f-f0a1cc96c7a2/hero-cropped-1776785336946.jpg',
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

  // Super Wash — 181 locations across 18 states. Rotation refreshed 2026-04-25
  // to use the chain's iconic blue-overhang exterior at 4 different
  // locations. Owner-curated picks: every photo shows the trademark blue
  // facade with "SUPER WASH" + "SUPERMATIC" signage prominently.
  // Elkhart IN (2048×1152, big centered SUPER WASH sign), Virden IL
  // (1600×1200, "#1 CAR WASH FRANCHISE" + SUPERMATIC), Columbia City IN
  // (2048×1152, SUPER WASH + SUPERMATIC dual sign), Bradley IL
  // (1600×1200, classic SUPER WASH with American flags).
  'Super Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/2d6e8151-b8b9-4ecb-a825-3c52c052760d/hero-cropped-1777112212971.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/7b2a5584-6a8c-4ed1-95bc-c2e2d05ec707/google-1777111415836.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/d5ef175a-0c7a-49cd-9e98-a58671b4413b/hero-cropped-1776862099064.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/325126bb-7641-4f82-84cb-bc90f5f3a5b6/google-1777111604296.jpg',
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

  // NOTE: Drive & Shine was removed 2026-04-17 — their own FAQ at
  // driveandshine.com/car-wash confirms they use "Neoglide Foam Wraps" which
  // are soft-cloth contact equipment, not touchless. All 39 locations reverted.
  // Do NOT re-add unless chain switches to touchless.

  // Phase 3 — Tier 2 regional chains. Hero images pulled from top-rated listings per chain.
  // NOTE: Prestige Car Wash removed 2026-04-17 — their own site at prestigewash.com
  // advertises "soft cloth technology" which is contact equipment, not touchless.
  // All Prestige locations reverted. Do NOT re-add.
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

  // ScrubaDub — 3 NH/MA locations with touchless laser wash bays.
  // Salem NH exterior, Shrewsbury MA exterior, Worcester MA hero crop.
  'ScrubaDub': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/fb4afd5f-8b0c-494e-9860-fe61ef8c53f6/google-1777054719526.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/5719711a-644c-4af7-828a-f846d31ce187/google-1777054727379.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/ff8554f7-2b40-4c68-9282-baca3184265a/hero-cropped-1777054851644.jpg',
  ],

  // Jurassic Car Wash — 4 TX locations. Austin Google photo REMOVED (it showed
  // spinning blue brushes — critical policy violation). Using 3 brush-free
  // Potranco location photos.
  'Jurassic Car Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/c3989e47-b6ad-444d-ab93-ede366c4a4fd/google-1773942002217.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/c3989e47-b6ad-444d-ab93-ede366c4a4fd/google-1773764179574.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/c3989e47-b6ad-444d-ab93-ede366c4a4fd/google-1773764319901.jpg',
  ],

  // Big-chain backfill 2026-05-25 — chains with >=6 approved listings that
  // had no brand image. Photos pulled from highest-rated listings per chain
  // (already curated supabase-hosted heroes — no new sourcing required).
  'Shell': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/54262d70-49d4-4e57-821f-17f00089b0f3/google-1774990835553.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/b8c1772e-f2df-487f-ad01-fd0bcc2e8200/hero-cropped-1774378247752.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/a72aafad-eecb-4244-8fa2-969a3bace271/place_photo_0_1774924000527.jpg',
  ],
  'Chevron': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/57465056-762a-43d5-b7b1-0373aca89ce4/place_photo_0_1774923424013.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/899f709e-0010-49c6-be83-d4be495ad980/hero-cropped-1774959734337.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/51d8b6ae-0692-4be4-993c-6c39c1250e88/place_photo_0_1774923352214.jpg',
  ],
  'Mobil': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/112aad85-aede-4aa9-8211-31643c3add45/place_photo_0_1774922786474.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/769169b4-e59f-483c-aec1-df7d3d711c55/gallery_bp_0_1774913183855.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/55ee860b-6b2b-4ae4-a2bc-24d98618007c/google-1776962902163.jpg',
  ],
  'Precision Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/7a665573-ebbc-4a3e-88dc-4c39d826c293/hero-cropped-1774129396222.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/0f01c5a3-d189-44e0-aae3-187ce0027f22/gallery_bp_2_1771868427078.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/dc8df2c0-7342-44ce-871d-ba47e779507b/google-1777036926385.jpg',
  ],
  'Sunoco': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/55303b4c-477c-4209-98ed-7dc48b2195ae/place_photo_2_1774923394870.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/3d7917c6-b424-48c2-8c35-6870c0df23c0/hero-cropped-1775042439253.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/25292f94-446a-488c-89a3-18491aad02ed/hero-cropped-1775042490132.jpg',
  ],
  'Coastal Carolina Car Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/abce74e1-95d6-4950-bcc9-ff8202b1f317/place_photo_0_1774924033671.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/fc70ab36-e1a4-48a3-8d78-d5a15c17abd6/google-1773922451724.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/246ac0a4-f5a8-4b5c-b3b0-ac3f43ea8ba7/hero-cropped-1776861705242.jpg',
  ],
  'Hoffman Car Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/7fb90ffc-e5b0-4984-9b83-674c2584037c/hero-cropped-1776935728919.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/488629a5-17b3-4788-8fc9-dd844fedca52/google-1776935803335.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/97f938da-2b18-4bcb-95a3-414028e42a70/google-1776935819478.jpg',
  ],
  'Exxon': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/4dd76241-f129-4ebc-a262-b483bc2f09a3/hero-cropped-1776878821138.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/a1186d59-8c20-455a-98ce-f28545c372e8/google-1777295698329.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/45e0665c-61c0-436d-b5c5-f3e92531a153/hero-cropped-1775043534049.jpg',
  ],
  'Spritz Car Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/424e4e56-6bfb-46c1-8426-7ddb08ce7c25/web_1_1772830493671.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/a4c9ee11-e379-49ae-a080-952619afc131/hero-cropped-1773689797314.png',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/50389322-bba4-4d18-a06e-f10ab314ab39/hero-cropped-1773690079756.png',
  ],
  '76': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/9ff4981f-999f-4173-95a1-616d29640b4a/place_photo_0_1774923948085.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/98568259-7b5a-48aa-ba84-bfb7c84f6f96/hero-cropped-1776609507722.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/86fc90f8-90f2-42ec-bd2f-ce30e02bb883/place_photo_0_1774923799169.jpg',
  ],
  'Mr Sparkle Car Wash': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/70192b6c-5b6f-48b5-a897-2931d9c87c8b/hero-cropped-1777023165662.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/828a8aea-5c7c-4452-a665-4ca61e92cb76/hero-cropped-1777023360098.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/ad59ce57-551e-44ca-b8d5-bc5a17cc2c4b/hero-cropped-1777920198753.jpg',
  ],
  'Marathon': [
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/listings/26c15dbd-9979-42d1-b55e-7da6115b3575/photo_0_1774922962908.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/54ea5ca3-5b1f-47b2-9476-7e5f18bb9374/google-1776961176642.jpg',
    'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/b1dbd924-d136-4daa-bf70-aedf3c3c4c2b/hero-cropped-1775043982250.jpg',
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
