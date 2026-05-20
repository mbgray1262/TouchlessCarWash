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
  // Prefer asin for direct product URL. Falls back to a brand+name Amazon search
  // when we don't have a verified ASIN yet — affiliate tag still attributes the session.
  asin?: string;
  searchQuery?: string;
  priceRange: string;
  rating: number;
  positioning: string;
}

export function amazonUrl(p: Product): string {
  const tag = `tag=${AMAZON_AFFILIATE_TAG}`;
  if (p.asin) return `https://www.amazon.com/dp/${p.asin}/?${tag}`;
  if (p.searchQuery) {
    return `https://www.amazon.com/s?k=${encodeURIComponent(p.searchQuery)}&${tag}`;
  }
  return `https://www.amazon.com/?${tag}`;
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
  },

  // ───── Touchless soaps ─────
  {
    id: 'swift-touchless-shampoo',
    brand: 'Swift',
    name: 'Touchless Car Wash Shampoo (Gallon)',
    category: 'touchless-soap',
    asin: 'B0B4X7D1ZC',
    priceRange: '$40-60',
    rating: 4.6,
    positioning:
      'Concentrated touchless formula — the same chemistry pro touchless tunnels use, but for your driveway.',
  },
  {
    id: 'meguiars-hyperwash',
    brand: "Meguiar's",
    name: 'Hyper-Wash Concentrated Soap (Gallon)',
    category: 'touchless-soap',
    searchQuery: "Meguiar's Hyper Wash gallon",
    priceRange: '$30',
    rating: 4.7,
    positioning: 'pH-neutral, commercial-grade — gentle on wax and ceramic coatings.',
  },
  {
    id: 'adams-car-shampoo',
    brand: "Adam's Polishes",
    name: 'Car Shampoo',
    category: 'touchless-soap',
    searchQuery: "Adam's Polishes Car Shampoo",
    priceRange: '$15-50',
    rating: 4.8,
    positioning:
      'Cult-favorite DIY brand. Sudses up thick, rinses clean, smells like cherries.',
  },

  // ───── Snow foam (touchless prewash) ─────
  {
    id: 'chemguys-honeydew-snow-foam',
    brand: 'Chemical Guys',
    name: 'Honeydew Snow Foam',
    category: 'snow-foam',
    searchQuery: 'Chemical Guys Honeydew Snow Foam',
    priceRange: '$20',
    rating: 4.7,
    positioning:
      'Thick foam clings to your paint and pulls grit off before you ever touch the car.',
  },
  {
    id: 'adams-mega-foam',
    brand: "Adam's Polishes",
    name: 'Mega Foam',
    category: 'snow-foam',
    searchQuery: "Adam's Mega Foam",
    priceRange: '$25',
    rating: 4.8,
    positioning: 'Premium pre-rinse foam — extra cling time on vertical panels.',
  },

  // ───── Foam cannons ─────
  {
    id: 'mtm-pf22',
    brand: 'MTM Hydro',
    name: 'PF22.2 Foam Cannon',
    category: 'foam-cannon',
    searchQuery: 'MTM Hydro PF22.2 Foam Cannon',
    priceRange: '$80',
    rating: 4.8,
    positioning:
      'Pro gold standard. The foam cannon serious detailers actually buy.',
  },
  {
    id: 'matcc-foam-cannon',
    brand: 'MATCC',
    name: 'Adjustable Foam Cannon',
    category: 'foam-cannon',
    searchQuery: 'MATCC Adjustable Foam Cannon',
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
    searchQuery: 'Sun Joe SPX3000 Electric Pressure Washer',
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
    searchQuery: 'Westinghouse ePX3100 Pressure Washer',
    priceRange: '$220',
    rating: 4.5,
    positioning:
      'Premium pick with brass fittings and longer hose — built to last.',
  },

  // ───── No-touch drying ─────
  {
    id: 'metrovac-master-blaster',
    brand: 'MetroVac',
    name: 'Master Blaster Sidekick',
    category: 'no-touch-drying',
    searchQuery: 'MetroVac Master Blaster Sidekick',
    priceRange: '$220',
    rating: 4.6,
    positioning:
      'Blows water off your car — zero contact, zero scratch risk. The detailer drying gold standard.',
  },

  // ───── Wheel care (no-touch) ─────
  {
    id: 'sonax-full-effect',
    brand: 'Sonax',
    name: 'Full Effect Wheel Cleaner',
    category: 'wheel-care',
    searchQuery: 'Sonax Full Effect Wheel Cleaner',
    priceRange: '$25',
    rating: 4.6,
    positioning:
      'Color-changing spray-and-rinse. Cleans brake dust without scrubbing.',
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

// Per-page-type curation — keeps presentation logic out of page files.
export const PLACEMENT_PRESETS = {
  // Existing converters — proven on listings + best metro pages
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
  // Equipment audience — they're researching gear, sell them the home setup
  equipment: ['mtm-pf22', 'sun-joe-spx3000', 'swift-touchless-shampoo', 'matcc-foam-cannon'],
  // Chain pages — between-wash care for subscription holders
  chains: [
    'swift-touchless-shampoo',
    'chemguys-honeydew-snow-foam',
    'meguiars-hybrid-ceramic-wax',
  ],
  // Unlimited subscribers — protection + drying between washes
  unlimited: [
    'meguiars-hybrid-ceramic-wax',
    'griots-microfiber-towel',
    'sonax-full-effect',
  ],
  // 24-hour hub — convenience-focused care
  twentyFourHour: [
    'meguiars-hybrid-ceramic-wax',
    'chemguys-interior-wipes',
    'griots-microfiber-towel',
  ],
  // Homepage strip — broadest mix, top picks
  homepage: [
    'swift-touchless-shampoo',
    'chemguys-honeydew-snow-foam',
    'mtm-pf22',
    'sun-joe-spx3000',
  ],
} as const satisfies Record<string, readonly string[]>;

export type PlacementPreset = keyof typeof PLACEMENT_PRESETS;
