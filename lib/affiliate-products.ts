export const AMAZON_AFFILIATE_TAG = 'touchlessfind-20';

export type ProductCategory =
  | 'touchless-soap'
  | 'snow-foam'
  | 'foam-cannon'
  | 'pressure-washer'
  | 'no-touch-drying'
  | 'wheel-care'
  | 'ceramic-protection'
  | 'drying-towel'
  | 'interior';

export interface Product {
  id: string;
  brand: string;
  name: string;
  category: ProductCategory;
  asin: string;
  priceRange: string;
  rating: number;
  positioning: string;
  // True when /images/P/{ASIN}.01.L.jpg returns a real product image (verified
  // at build time).
  hasImage?: boolean;
  // Explicit image URL — overrides the canonical pattern. Used for newer
  // Amazon products whose image hash isn't ASIN-derivable; sourced from
  // search engine image results (m.media-amazon.com/images/I/{hash}.jpg).
  imageUrl?: string;
}

export function amazonUrl(p: Product): string {
  return `https://www.amazon.com/dp/${p.asin}/?tag=${AMAZON_AFFILIATE_TAG}`;
}

export function amazonImageUrl(p: Product): string | null {
  if (p.imageUrl) return p.imageUrl;
  if (p.hasImage) return `https://images-na.ssl-images-amazon.com/images/P/${p.asin}.01.L.jpg`;
  return null;
}

const CATEGORY_GRADIENTS: Record<ProductCategory, string> = {
  'touchless-soap': 'from-blue-100 to-cyan-50',
  'snow-foam': 'from-sky-100 to-blue-50',
  'foam-cannon': 'from-cyan-100 to-teal-50',
  'pressure-washer': 'from-slate-200 to-blue-50',
  'no-touch-drying': 'from-blue-100 to-indigo-50',
  'wheel-care': 'from-amber-100 to-yellow-50',
  'ceramic-protection': 'from-indigo-100 to-blue-50',
  'drying-towel': 'from-emerald-100 to-teal-50',
  interior: 'from-purple-100 to-fuchsia-50',
};

export function categoryGradient(p: Product): string {
  return CATEGORY_GRADIENTS[p.category];
}

export const PRODUCTS: Product[] = [
  // ───── Existing 3 (verified converting) ─────
  {
    id: 'meguiars-hybrid-ceramic-wax',
    brand: "Meguiar's",
    name: 'Hybrid Ceramic Wax',
    category: 'ceramic-protection',
    asin: 'B06WVQ6MVR',
    priceRange: '$20',
    rating: 4.7,
    positioning:
      'Spray on your wet car right after the touchless wash, rinse off, done. Ceramic protection with zero buffing.',
    hasImage: true,
  },
  {
    id: 'griots-microfiber-towel',
    brand: "Griot's Garage",
    name: 'XL Microfiber Drying Towel',
    category: 'drying-towel',
    asin: 'B07G7DSF7C',
    priceRange: '$25',
    rating: 4.9,
    positioning:
      'Prevents water spots after the wash. Scratch-free and safe for ceramic coatings and PPF.',
    hasImage: true,
  },
  {
    id: 'chemguys-interior-wipes',
    brand: 'Chemical Guys',
    name: 'Interior Cleaner Wipes',
    category: 'interior',
    asin: 'B0B4PR1W7K',
    priceRange: '$15',
    rating: 4.5,
    positioning:
      'Toss in the glovebox. Wipe down dash, seats, and trim while you wait in the wash line.',
    hasImage: true,
  },

  // ───── Touchless soaps ─────
  // Products with "Touchless" in the name are flagship for this site — even
  // when their canonical Amazon image URL doesn't resolve, the fallback
  // styling highlights the keyword to match search intent.
  {
    id: 'swift-touchless-shampoo',
    brand: 'Swift',
    name: 'Touchless Car Wash Shampoo (Gallon)',
    category: 'touchless-soap',
    asin: 'B0B4X7D1ZC',
    priceRange: '$40',
    rating: 4.3,
    positioning:
      'No brushing required. Heavy-duty foaming formula — spray, wait 2-3 min, rinse.',
    imageUrl: 'https://m.media-amazon.com/images/I/41-gPyz0faL._SL500_.jpg',
  },
  {
    id: 'optimum-touchless-decon',
    brand: 'Optimum',
    name: 'Touchless Decon Car Wash Soap (32oz)',
    category: 'touchless-soap',
    asin: 'B0DJFSDB5R',
    priceRange: '$30',
    rating: 4.7,
    positioning:
      'pH-neutral, ceramic-coating safe. Spray on, rinse off — no contact, no scratch risk.',
    imageUrl: 'https://m.media-amazon.com/images/I/31NszMWmPYL.jpg',
  },
  {
    id: 'wash-chems-pro100-combo',
    brand: 'Wash Chems',
    name: 'PRO-100 Touchless Soap + Foam Cannon Combo',
    category: 'touchless-soap',
    asin: 'B07ZQQGBYB',
    priceRange: '$50-80',
    rating: 4.5,
    positioning:
      'Commercial-grade soap PLUS the foam cannon. Everything you need for at-home touchless in one box.',
    imageUrl: 'https://m.media-amazon.com/images/I/614S1YBLm5L._AC_.jpg',
  },
  {
    id: 'meguiars-hyperwash',
    brand: "Meguiar's",
    name: 'Hyper-Wash Foaming Car Wash (Gallon)',
    category: 'touchless-soap',
    asin: 'B0006SH4IM',
    priceRange: '$30',
    rating: 4.7,
    positioning:
      'Commercial-grade foaming wash. Body shop safe, biodegradable, lifts dirt without stripping wax.',
    hasImage: true,
  },
  {
    id: 'adams-car-shampoo',
    brand: "Adam's Polishes",
    name: 'Car Shampoo (16oz)',
    category: 'touchless-soap',
    asin: 'B0058JJS0Q',
    priceRange: '$15',
    rating: 4.8,
    positioning:
      'pH-best biodegradable formula. Cult-favorite DIY brand with thick suds and zero scratch risk.',
  },

  // ───── Snow foam (touchless prewash) ─────
  {
    id: 'chemguys-honeydew-snow-foam',
    brand: 'Chemical Guys',
    name: 'Honeydew Snow Foam (16oz)',
    category: 'snow-foam',
    asin: 'B009OTK094',
    priceRange: '$20',
    rating: 4.7,
    positioning:
      'Thick foam clings to your paint and pulls grit off before you ever touch the car.',
    hasImage: true,
  },
  {
    id: 'adams-mega-foam',
    brand: "Adam's Polishes",
    name: 'Mega Foam (16oz)',
    category: 'snow-foam',
    asin: 'B07SPY1CLW',
    priceRange: '$25',
    rating: 4.8,
    positioning:
      '10× concentrated formula. Won’t strip wax or ceramic coatings — pure cling foam.',
  },

  // ───── Foam cannons ─────
  {
    id: 'mtm-pf22',
    brand: 'MTM Hydro',
    name: 'PF22.2 Foam Cannon',
    category: 'foam-cannon',
    asin: 'B083P6D7DT',
    priceRange: '$80',
    rating: 4.8,
    positioning:
      'Italian-made pro standard. The foam cannon serious detailers actually buy.',
  },
  {
    id: 'matcc-foam-cannon',
    brand: 'MATCC',
    name: 'Adjustable Foam Cannon',
    category: 'foam-cannon',
    asin: 'B01CE78VO8',
    priceRange: '$35',
    rating: 4.5,
    positioning:
      'Budget entry — pairs with any pressure washer. Adjustable foam thickness.',
  },

  // ───── Electric pressure washers ─────
  {
    id: 'sun-joe-spx3000',
    brand: 'Sun Joe',
    name: 'SPX3000 Electric Pressure Washer',
    category: 'pressure-washer',
    asin: 'B00CPGMUXW',
    priceRange: '$160',
    rating: 4.5,
    positioning:
      "Amazon's best-selling electric pressure washer — turn your driveway into a touchless wash bay.",
  },
  {
    id: 'westinghouse-epx3100',
    brand: 'Westinghouse',
    name: 'ePX3100 Electric Pressure Washer',
    category: 'pressure-washer',
    asin: 'B083B2M9NT',
    priceRange: '$220',
    rating: 4.5,
    positioning:
      'Premium pick. 2,300 PSI, anti-tipping design, onboard soap tank — built to last.',
    hasImage: true,
  },

  // ───── No-touch drying ─────
  {
    id: 'metrovac-master-blaster',
    brand: 'MetroVac',
    name: 'Air Force Blaster Sidekick',
    category: 'no-touch-drying',
    asin: 'B00US404U4',
    priceRange: '$130',
    rating: 4.6,
    positioning:
      'Blows water off your car — zero contact, zero scratch risk. Made in USA.',
  },

  // ───── Wheel care (no-touch) ─────
  {
    id: 'sonax-full-effect',
    brand: 'Sonax',
    name: 'Full Effect Wheel Cleaner',
    category: 'wheel-care',
    asin: 'B003UT3S6Q',
    priceRange: '$25',
    rating: 4.6,
    positioning:
      'Color-changing spray-and-rinse. Cleans brake dust without scrubbing.',
    hasImage: true,
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function getProducts(ids: readonly string[]): Product[] {
  return ids
    .map((id) => getProduct(id))
    .filter((p): p is Product => p !== undefined);
}

export function productsByCategory(...categories: ProductCategory[]): Product[] {
  const set = new Set(categories);
  return PRODUCTS.filter((p) => set.has(p.category));
}

// Used by the /shop page to organize the catalog into browseable sections.
export const SHOP_SECTIONS: { id: string; title: string; subtitle: string; categories: ProductCategory[] }[] = [
  {
    id: 'touchless-soaps',
    title: 'Touchless Soaps',
    subtitle: 'Spray-on, rinse-off shampoos formulated for no-contact washing — the same chemistry pro touchless tunnels use.',
    categories: ['touchless-soap'],
  },
  {
    id: 'snow-foam',
    title: 'Snow Foam & Pre-Rinse',
    subtitle: 'Thick clinging foam that lifts grit off your paint before you ever touch the car.',
    categories: ['snow-foam'],
  },
  {
    id: 'foam-cannons',
    title: 'Foam Cannons',
    subtitle: 'The pressure-washer attachment that turns touchless soap into a thick blanket of suds.',
    categories: ['foam-cannon'],
  },
  {
    id: 'pressure-washers',
    title: 'Pressure Washers',
    subtitle: 'Electric pressure washers that turn your driveway into a touchless wash bay.',
    categories: ['pressure-washer'],
  },
  {
    id: 'drying',
    title: 'Drying — Touchless & Microfiber',
    subtitle: 'Air-blower dryers and ultra-soft microfibers that finish the wash without scratch risk.',
    categories: ['no-touch-drying', 'drying-towel'],
  },
  {
    id: 'protection',
    title: 'Ceramic & Wax Protection',
    subtitle: 'Spray-on protection that makes future touchless washes shed dirt and water faster.',
    categories: ['ceramic-protection'],
  },
  {
    id: 'wheels-interior',
    title: 'Wheel & Interior Care',
    subtitle: 'Spray-and-rinse wheel cleaners and quick interior wipes for between-wash maintenance.',
    categories: ['wheel-care', 'interior'],
  },
];

// Per-page-type curation. Image-having products are preferred for grid-style
// placements so the visual is consistent; the catalog still references the
// non-imaged products via search-result swaps later.
export const PLACEMENT_PRESETS = {
  // Sticky sidebar — keep the 3 image-having products (sidebar prominence
  // benefits from real product photos since the unit is small/glanceable)
  listing: [
    'meguiars-hybrid-ceramic-wax',
    'griots-microfiber-towel',
    'chemguys-interior-wipes',
  ],
  metroBest: [
    'meguiars-hybrid-ceramic-wax',
    'griots-microfiber-towel',
    'chemguys-interior-wipes',
  ],
  // Homepage — lead with touchless-named products since this is the front
  // door for visitors searching "touchless car wash". The TOUCHLESS keyword
  // in card titles is more valuable than image consistency.
  homepage: [
    'swift-touchless-shampoo',
    'optimum-touchless-decon',
    'chemguys-honeydew-snow-foam',
    'meguiars-hyperwash',
  ],
  // Equipment audience — DIY at home. Push touchless soap + the combo kit.
  equipment: [
    'swift-touchless-shampoo',
    'wash-chems-pro100-combo',
    'westinghouse-epx3100',
    'chemguys-honeydew-snow-foam',
  ],
  // Chain subscribers — when their unlimited's closed or they want to
  // reproduce that touchless experience at home.
  chains: [
    'swift-touchless-shampoo',
    'optimum-touchless-decon',
    'meguiars-hybrid-ceramic-wax',
  ],
  // Unlimited subscribers — between-wash care. Add Optimum for ceramic owners.
  unlimited: [
    'optimum-touchless-decon',
    'meguiars-hybrid-ceramic-wax',
    'griots-microfiber-towel',
  ],
  // 24-hour convenience focus — quick interior + drying essentials
  twentyFourHour: [
    'meguiars-hybrid-ceramic-wax',
    'chemguys-interior-wipes',
    'griots-microfiber-towel',
  ],
} as const satisfies Record<string, readonly string[]>;

export type PlacementPreset = keyof typeof PLACEMENT_PRESETS;
