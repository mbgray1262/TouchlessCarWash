/**
 * Chain rankings data layer.
 *
 * Powers /best/chains (national Top 10) and /best/chains/[region] pages.
 * Fetches live rating + location data from the DB so rankings stay accurate
 * as new listings are added. Award categories are assigned dynamically.
 */

import { publicListings } from './public-listings';
import { CHAINS } from './chains';
import { getChainHeroImage } from './chain-brand-images';

// ── Region definitions ────────────────────────────────────────────────

export type ChainRegionSlug = 'midwest' | 'pacific' | 'northeast' | 'southeast' | 'mountain-west';

export interface ChainRegion {
  slug: ChainRegionSlug;
  name: string;
  shortName: string;
  states: string[];
  tagline: string;
  description: string;
}

export const CHAIN_REGIONS: ChainRegion[] = [
  {
    slug: 'midwest',
    name: 'Midwest',
    shortName: 'Midwest',
    states: ['OH', 'IN', 'MI', 'IL', 'WI', 'MN', 'IA', 'MO', 'ND', 'SD', 'NE', 'KS'],
    tagline: 'The heartland of touchless car washing — home to the largest chains in the US.',
    description: 'The Midwest is the most active region for touchless car wash chains, anchored by Kwik Trip\'s massive network across Wisconsin, Minnesota, and Iowa. Midwest chains lead the country in location count and convenience-store-attached touchless washes.',
  },
  {
    slug: 'pacific',
    name: 'Pacific Coast',
    shortName: 'Pacific',
    states: ['WA', 'OR', 'CA', 'AK', 'HI'],
    tagline: 'From Seattle to San Diego — the West Coast\'s best touchless car wash chains.',
    description: 'California and the Pacific Northwest have a strong tradition of gas-station-attached touchless washes. H&S Energy brands (Power Market, Extra Mile, Pinnacle 365) dominate California, while Brown Bear and Elephant Car Wash have built loyal followings in the Pacific Northwest.',
  },
  {
    slug: 'northeast',
    name: 'Northeast',
    shortName: 'Northeast',
    states: ['ME', 'VT', 'NH', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA'],
    tagline: 'New England and Mid-Atlantic\'s top-rated touchless car wash chains.',
    description: 'The Northeast is home to several long-standing regional chains. Sheetz anchors Pennsylvania and New York with consistent touchless options, while iconic local operators like Hoffman Car Wash, ScrubaDub, and Precision Wash have built strong regional reputations for quality.',
  },
  {
    slug: 'southeast',
    name: 'Southeast',
    shortName: 'Southeast',
    states: ['MD', 'DE', 'DC', 'VA', 'WV', 'NC', 'SC', 'GA', 'FL', 'AL', 'MS', 'TN', 'KY'],
    tagline: 'The South\'s best touchless car wash chains, from Florida to Virginia.',
    description: 'Florida leads the Southeast in touchless chain density. Max Car Wash has built one of the region\'s strongest networks in the Tampa Bay area, while the Carolinas have emerging regional operators offering high-quality automatic touchless washes.',
  },
  {
    slug: 'mountain-west',
    name: 'Mountain & Southwest',
    shortName: 'Mountain/SW',
    states: ['MT', 'ID', 'WY', 'CO', 'NM', 'AZ', 'UT', 'NV'],
    tagline: 'Rocky Mountain and desert Southwest\'s top touchless car wash chains.',
    description: 'Colorado and Nevada lead the Mountain/Southwest region. Autowash has built a strong reputation in Denver and Colorado\'s Front Range, while Terrible\'s (Affinity Gaming) operates touchless washes across Nevada and Arizona. ProClean serves the Pueblo and Colorado Springs corridor.',
  },
];

export function getRegionBySlug(slug: string): ChainRegion | null {
  return CHAIN_REGIONS.find(r => r.slug === slug) ?? null;
}

// ── Informational label definitions ──────────────────────────────────
//
// These labels appear as chips on ranking cards to surface objective
// data at a glance. They are NOT claimable as badge images — chain
// award badges are positional (#1 / #2 / #3) just like the city
// Best Of badges. Hidden Gem was removed as too subjective.

export type LabelCategory = 'most-locations' | 'highest-rated' | 'widest-coverage';

export interface ChainLabel {
  category: LabelCategory;
  label: string;
  emoji: string;
  description: string;
  color: string; // tailwind bg class
  textColor: string;
}

export const CHAIN_LABELS: Record<LabelCategory, ChainLabel> = {
  'most-locations': {
    category: 'most-locations',
    label: 'Most Locations',
    emoji: '🏆',
    description: 'Most verified touchless car wash locations',
    color: 'bg-yellow-50 border-yellow-300',
    textColor: 'text-yellow-800',
  },
  'highest-rated': {
    category: 'highest-rated',
    label: 'Highest Rated',
    emoji: '⭐',
    description: 'Best average Google rating (min 10 locations)',
    color: 'bg-blue-50 border-blue-300',
    textColor: 'text-blue-800',
  },
  'widest-coverage': {
    category: 'widest-coverage',
    label: 'Widest Coverage',
    emoji: '📍',
    description: 'Touchless locations across the most states',
    color: 'bg-green-50 border-green-300',
    textColor: 'text-green-800',
  },
};

// Keep AWARDS as an alias so existing imports don't break immediately
/** @deprecated use CHAIN_LABELS */
export const AWARDS = CHAIN_LABELS as unknown as Record<string, ChainLabel>;
export type AwardCategory = LabelCategory;

// ── Ranked chain type ─────────────────────────────────────────────────

export interface RankedChain {
  name: string;
  slug: string;
  locationCount: number;
  avgRating: number | null;
  totalReviews: number;
  statesPresent: string[];  // states within the relevant region (or all states for national)
  heroImage: string | null;
  description: string;
  /** Informational labels shown on cards (not claimable badges — those are positional) */
  labels: LabelCategory[];
  /** @deprecated use labels — kept for backwards compat */
  awards: LabelCategory[];
  /** @deprecated use labels[0] */
  award: LabelCategory | null;
}

// ── Data fetching helpers ─────────────────────────────────────────────

type RawRow = { parent_chain: string; state: string; rating: number | null; review_count: number | null; hero_image: string | null };

async function fetchChainRows(stateFilter?: string[]): Promise<RawRow[]> {
  const all: RawRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = publicListings('parent_chain, state, rating, review_count, hero_image')
      .not('parent_chain', 'is', null)
      // Stable sort key is REQUIRED for correct .range() pagination: without an
      // explicit order, Postgres may return rows in a different order on each
      // page request, so rows get skipped/duplicated across page boundaries once
      // the result exceeds 1000 rows. That made per-chain locationCount (and thus
      // the rankings) non-deterministic, which flipped chains across the top-3
      // badge boundary and produced FLAKY /badge/chain/<slug> 404s + broken
      // internal links. Ordering by the unique id makes pagination deterministic.
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (stateFilter) q = q.in('state', stateFilter);
    const { data } = await q;
    if (!data || data.length === 0) break;
    all.push(...(data as RawRow[]));
    if (data.length < 1000) break;
  }
  return all;
}

function aggregateRows(rows: RawRow[]): Record<string, {
  count: number; states: Set<string>; ratings: number[]; totalReviews: number; bestHero: string | null; bestHeroReviews: number;
}> {
  const map: Record<string, { count: number; states: Set<string>; ratings: number[]; totalReviews: number; bestHero: string | null; bestHeroReviews: number }> = {};
  for (const row of rows) {
    if (!row.parent_chain) continue;
    if (!map[row.parent_chain]) map[row.parent_chain] = { count: 0, states: new Set(), ratings: [], totalReviews: 0, bestHero: null, bestHeroReviews: -1 };
    const m = map[row.parent_chain];
    m.count++;
    m.states.add(row.state);
    if (row.rating != null && row.rating > 0) m.ratings.push(Number(row.rating));
    m.totalReviews += (row.review_count ?? 0);
    // Fallback chain hero: keep the most-reviewed member listing's photo, used
    // when a chain has no curated brand image (so cards never show a placeholder).
    const rc = row.review_count ?? 0;
    if (row.hero_image && rc > m.bestHeroReviews) { m.bestHero = row.hero_image; m.bestHeroReviews = rc; }
  }
  return map;
}

function buildRankedList(
  chainMap: ReturnType<typeof aggregateRows>,
  minLocations: number,
  limit?: number,
): RankedChain[] {
  const results: RankedChain[] = [];
  for (const chain of CHAINS) {
    const stats = chainMap[chain.name];
    if (!stats || stats.count < minLocations) continue;
    const avg = stats.ratings.length > 0
      ? stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length
      : null;
    results.push({
      name: chain.name,
      slug: chain.slug,
      locationCount: stats.count,
      avgRating: avg != null ? Math.round(avg * 10) / 10 : null,
      totalReviews: stats.totalReviews,
      statesPresent: Array.from(stats.states).sort(),
      heroImage: getChainHeroImage(chain.name) ?? stats.bestHero,
      description: chain.description.replace(/\{count\}/g, String(stats.count)),
      labels: [],
      awards: [],
      award: null,
    });
  }
  results.sort((a, b) => b.locationCount - a.locationCount);
  return limit ? results.slice(0, limit) : results;
}

/**
 * Assigns informational labels to chains based on objective data.
 * Labels appear as chips on ranking cards but are NOT claimable badges.
 * Claimable badges are positional (#1/#2/#3) — see /api/badge/chain.
 * Each label goes to exactly one chain; a chain can hold at most one label.
 */
function assignLabels(chains: RankedChain[]): void {
  if (chains.length === 0) return;
  const labelled = new Set<string>();

  // Most Locations → highest count (always #1 in the sorted list)
  chains[0].labels = ['most-locations'];
  chains[0].awards = ['most-locations'];
  chains[0].award = 'most-locations';
  labelled.add(chains[0].name);

  // Highest Rated → absolute best avg rating, min 10 locations for statistical significance
  const byRating = [...chains]
    .filter(c => c.avgRating != null && c.locationCount >= 10 && !labelled.has(c.name))
    .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0));
  if (byRating[0]) {
    byRating[0].labels = ['highest-rated'];
    byRating[0].awards = ['highest-rated'];
    byRating[0].award = 'highest-rated';
    labelled.add(byRating[0].name);
  }

  // Widest Coverage → most states, not already labelled
  const byCoverage = [...chains]
    .filter(c => !labelled.has(c.name) && c.statesPresent.length > 1)
    .sort((a, b) => b.statesPresent.length - a.statesPresent.length);
  if (byCoverage[0]) {
    byCoverage[0].labels = ['widest-coverage'];
    byCoverage[0].awards = ['widest-coverage'];
    byCoverage[0].award = 'widest-coverage';
  }
}

// ── Public API ────────────────────────────────────────────────────────

export async function getNationalChainRankings(): Promise<RankedChain[]> {
  const rows = await fetchChainRows();
  const map = aggregateRows(rows);
  const chains = buildRankedList(map, 5, 10);
  assignLabels(chains);
  return chains;
}

export async function getRegionalChainRankings(regionSlug: ChainRegionSlug): Promise<RankedChain[]> {
  const region = getRegionBySlug(regionSlug);
  if (!region) return [];
  const rows = await fetchChainRows(region.states);
  const map = aggregateRows(rows);
  const chains = buildRankedList(map, 3);
  assignLabels(chains);
  return chains;
}

/**
 * Returns all the positional badge claims for a given chain slug.
 * Used by /badge/chain/[slug] to show every rank the chain has earned.
 *
 * - `national`: top-3 national claim (used for floating "Claim Badge" button on chain pages)
 * - `nationalRank`: rank 1–10 (used for consolation Top 10 badge on claim page)
 * - `regional`: top-3 regional claims (positional badges only, no consolation for regional)
 */
export async function getChainBadgeClaims(chainSlug: string): Promise<{
  national: { rank: number; scopeName: string; scopeUrl: string } | null;
  nationalRank: number | null;
  regional: { rank: number; scopeName: string; scopeUrl: string; regionSlug: string }[];
}> {
  const SITE_URL = 'https://touchlesscarwashfinder.com';
  const nationalChains = await getNationalChainRankings();
  const nationalIdx = nationalChains.findIndex(c => c.slug === chainSlug);

  // national: top 3 only — used for the floating "Claim Badge" CTA on chain pages
  const national = nationalIdx !== -1 && nationalIdx < 3
    ? { rank: nationalIdx + 1, scopeName: 'America', scopeUrl: `${SITE_URL}/best/chains` }
    : null;

  // nationalRank: 1–10 — used to decide badge type on claim page (positional vs Top 10)
  const nationalRank = nationalIdx !== -1 ? nationalIdx + 1 : null;

  const regional: { rank: number; scopeName: string; scopeUrl: string; regionSlug: string }[] = [];
  for (const region of CHAIN_REGIONS) {
    const regionChains = await getRegionalChainRankings(region.slug);
    const idx = regionChains.findIndex(c => c.slug === chainSlug);
    if (idx !== -1 && idx < 3) {
      regional.push({
        rank: idx + 1,
        scopeName: region.shortName,
        scopeUrl: `${SITE_URL}/best/chains/${region.slug}`,
        regionSlug: region.slug,
      });
    }
  }

  return { national, nationalRank, regional };
}
