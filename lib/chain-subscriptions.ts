/**
 * Per-chain subscription data mined from existing crawl_snapshot records
 * (zero-cost: regex extraction, no new API calls). The raw mining output is
 * in chain-subscriptions.generated.json — regenerate via:
 *
 *   node scripts/mine-subscription-snapshots.mjs
 *
 * This module merges the mined data with a human-curated fallback blurb for
 * chains where the snapshots didn't capture pricing (e.g. Sheetz, Kwik Trip
 * snapshots only cover individual store pages, not the chain-wide membership
 * landing page).
 */
import raw from './chain-subscriptions.generated.json';

export type MinedChainSubscription = {
  slug: string;
  name: string;
  snapshotsMined: number;
  totalListings: number;
  prices: number[];
  minPrice: number | null;
  maxPrice: number | null;
  planNames: string[];
  features: {
    hasUnlimited: boolean;
    hasFamilyPlan: boolean;
    hasCeramic: boolean;
    hasFreeVacuums: boolean;
    has24Hour: boolean;
    cancelAnytime: boolean;
  };
};

const MINED: Record<string, MinedChainSubscription> = Object.fromEntries(
  (raw.chains as MinedChainSubscription[]).map(c => [c.slug, c]),
);

// Filter mined prices to a plausible single-vehicle monthly range. Many chains
// publish multi-vehicle family plan totals on the same page (e.g. Drive & Shine
// shows $77/mo for a 3-car plan), which we don't want to surface as the headline
// entry price.
const MAX_SINGLE_VEHICLE_MONTHLY = 75;

export type ChainSubscriptionDisplay = {
  slug: string;
  // Human-readable price band for display ("$19.99/mo", "$20–$35/mo", or 'Monthly plan available' if no data)
  priceLabel: string;
  // Marketing plan name, if mined from the chain's own site
  planName: string | null;
  // Short curated blurb describing how the chain's unlimited plan works
  blurb: string;
  // Source flag so the UI can show a disclaimer when we're relying on the curated blurb
  priceSource: 'mined' | 'estimate';
};

type CuratedDetails = {
  blurb: string;
  // Shown only when we don't have mined price data
  estimatePrice: string;
  // Override the auto-selected plan name for display
  preferredPlanName?: string;
};

const CURATED: Record<string, CuratedDetails> = {
  'sheetz': {
    blurb: 'Unlimited LaserWash 360 Plus touchless washes at participating Sheetz car wash locations. Sheetz runs 3 tiers on the PDQ LaserWash — base touchless plus upgrade tiers with rain protectant and wax.',
    estimatePrice: '$25–$40/mo',
  },
  'delta-sonic': {
    blurb: 'Delta Sonic runs an Unlimited Plan specific to the location where you buy it. Their touchless bay is one of multiple wash tiers (Touch-Less, Super Kiss, brush) offered side-by-side at each site.',
    estimatePrice: '$25–$45/mo',
    preferredPlanName: 'Unlimited Plan',
  },
  'drive-and-shine': {
    blurb: 'Drive & Shine offers Unlimited VIP Memberships using their PDQ LaserWash 360 Plus touchless equipment. Multiple tiers, plus family plans covering up to 3 vehicles — popular among Indiana and Michigan drivers for winter salt protection.',
    estimatePrice: '$20–$40/mo',
    preferredPlanName: 'Unlimited VIP Wash',
  },
  'kwik-trip': {
    blurb: 'Kwik Trip\'s Car Wash Club works only at verified Touch Free locations (not their soft-wash bays). Multiple tiers, plate-linked membership rather than a windshield tag.',
    estimatePrice: '$20–$35/mo',
    preferredPlanName: 'Car Wash Club',
  },
  'splash-car-wash': {
    blurb: 'Splash Unlimited gives all-location access across Connecticut, New York, and Vermont. Multiple plan tiers; the Ceramic Wash tier adds long-lasting hydrophobic coating and is their most popular plan.',
    estimatePrice: '$25–$45/mo',
    preferredPlanName: 'Splash Unlimited',
  },
  'prestige-car-wash': {
    blurb: 'Prestige\'s VIP Wash Club is all-access across every eastern-Massachusetts touchless bay they operate. Free vacuums included, single flat-rate plan starts as low as $19/mo.',
    estimatePrice: '$19–$30/mo',
    preferredPlanName: 'VIP Wash Club',
  },
  'flagstop-car-wash': {
    blurb: 'Flagstop\'s Unlimited Wash Club works across all their Richmond-metro sites, but only the North Chesterfield location has a dedicated touchless bay. Members can still use the tunnel sites if they choose.',
    estimatePrice: '$20–$35/mo',
    preferredPlanName: 'Unlimited Wash Club',
  },
  'foam-and-wash': {
    blurb: 'Foam & Wash unlimited plans cover all Hudson Valley touchless sites. Tier pricing scales from the base monthly plan up to their top ceramic tier.',
    estimatePrice: '$30–$60/mo',
  },
  'mr-magic-car-wash': {
    blurb: 'Mr. Magic\'s Unlimited Wash Club covers unlimited visits across their Pittsburgh-metro and West Virginia touchless bays. Multiple tiers starting at $19.99/mo.',
    estimatePrice: '$20–$60/mo',
    preferredPlanName: 'Unlimited Wash Club',
  },
  'autowash': {
    blurb: 'Autowash runs an unlimited Colorado-wide plan covering every one of their touchless bays from Fort Collins to Highlands Ranch. Popular with winter/ski commuters who hit I-70 weekly.',
    estimatePrice: '$25–$60/mo',
  },
  'super-wash': {
    blurb: 'Super Wash offers a Monthly Wash Club at participating Super Wash locations — touchless unlimited coverage across much of their 20-state footprint. Pricing runs below the national average.',
    estimatePrice: '$20–$35/mo',
    preferredPlanName: 'Monthly Wash Club',
  },
  'brown-bear': {
    blurb: 'Brown Bear\'s Unlimited Wash Club covers unlimited visits to their Puget Sound and Spokane touchless bays. Single-vehicle plan; pet-friendly vacuums included.',
    estimatePrice: '$25–$40/mo',
    preferredPlanName: 'Unlimited Wash Club',
  },
  'holiday-stationstores': {
    blurb: 'Holiday (now Circle K) runs a Wash Club tied to your license plate. Works across upper-Midwest Touch Free bays and is usually bundled with fuel discounts.',
    estimatePrice: '$20–$35/mo',
    preferredPlanName: 'Wash Club',
  },
  'salty-dog-car-wash': {
    blurb: 'Salty Dog\'s Wash Club covers every Florida east-coast touchless location. Multiple tiers; top tier adds ceramic and a hot-wax pass.',
    estimatePrice: '$25–$40/mo',
    preferredPlanName: 'Wash Club',
  },
  'power-market': {
    blurb: 'Power Market (part of H&S Energy) offers unlimited on their Istobal touchless equipment across California, Oregon, and Nevada. Single-vehicle plan keyed to your plate.',
    estimatePrice: '$20–$30/mo',
  },
  'extra-mile': {
    blurb: 'Extra Mile is Chevron\'s convenience store brand, also under H&S Energy. Unlimited plans work on their Istobal touchless bays at participating California locations.',
    estimatePrice: '$20–$30/mo',
  },
  'pinnacle-365': {
    blurb: 'Pinnacle 365 runs the same H&S Energy unlimited plan as Power Market and Extra Mile — Istobal touchless bays, plate-linked membership, California and Oregon coverage.',
    estimatePrice: '$20–$30/mo',
  },
};

function formatPriceBand(prices: number[]): string | null {
  const single = prices.filter(p => p <= MAX_SINGLE_VEHICLE_MONTHLY);
  if (single.length === 0) return null;
  const min = single[0];
  const max = single[single.length - 1];
  const fmt = (n: number) => (n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`);
  if (min === max || single.length === 1) return `${fmt(min)}/mo`;
  return `${fmt(min)}–${fmt(max)}/mo`;
}

function pickPlanName(mined: MinedChainSubscription, preferred?: string): string | null {
  if (preferred) {
    const match = mined.planNames.find(p => p.toLowerCase() === preferred.toLowerCase());
    if (match) return match;
    return preferred;
  }
  // Prefer "Unlimited" branded names over generic "Wash Club"
  const unlimited = mined.planNames.find(p => /unlimited/i.test(p));
  if (unlimited) return unlimited;
  const club = mined.planNames.find(p => /club|pass|plan|membership/i.test(p));
  return club ?? null;
}

export function getChainSubscriptionDisplay(slug: string): ChainSubscriptionDisplay | null {
  const curated = CURATED[slug];
  if (!curated) return null;
  const mined = MINED[slug];
  const mineBand = mined ? formatPriceBand(mined.prices) : null;
  const priceLabel = mineBand ?? curated.estimatePrice;
  const planName = mined ? pickPlanName(mined, curated.preferredPlanName) : (curated.preferredPlanName ?? null);
  return {
    slug,
    priceLabel,
    planName,
    blurb: curated.blurb,
    priceSource: mineBand ? 'mined' : 'estimate',
  };
}

export function getAllChainSubscriptionDisplays(): ChainSubscriptionDisplay[] {
  return Object.keys(CURATED).map(slug => getChainSubscriptionDisplay(slug)!);
}

export const MINED_AT = raw.generatedAt as string;
