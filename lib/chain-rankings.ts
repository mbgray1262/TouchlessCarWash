/**
 * Chain rankings data layer.
 *
 * Powers /best/chains (national Top 10) and /best/chains/[region] pages.
 * Fetches live rating + location data from the DB so rankings stay accurate
 * as new listings are added. Award categories are assigned dynamically.
 */

import { supabase } from './supabase';
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

// ── Award definitions ─────────────────────────────────────────────────

export type AwardCategory = 'most-locations' | 'highest-rated' | 'widest-coverage' | 'hidden-gem';

export interface Award {
  category: AwardCategory;
  label: string;
  emoji: string;
  description: string;
  color: string; // tailwind bg class
  textColor: string;
}

export const AWARDS: Record<AwardCategory, Award> = {
  'most-locations': {
    category: 'most-locations',
    label: 'Most Locations',
    emoji: '🏆',
    description: 'Most verified touchless car wash locations in the region',
    color: 'bg-yellow-50 border-yellow-300',
    textColor: 'text-yellow-800',
  },
  'highest-rated': {
    category: 'highest-rated',
    label: 'Highest Rated',
    emoji: '⭐',
    description: 'Best average Google rating across all locations in the region',
    color: 'bg-blue-50 border-blue-300',
    textColor: 'text-blue-800',
  },
  'widest-coverage': {
    category: 'widest-coverage',
    label: 'Widest Coverage',
    emoji: '📍',
    description: 'Touchless locations in the most states in the region',
    color: 'bg-green-50 border-green-300',
    textColor: 'text-green-800',
  },
  'hidden-gem': {
    category: 'hidden-gem',
    label: 'Hidden Gem',
    emoji: '💎',
    description: 'Highest-rated smaller chain — exceptional quality, growing footprint',
    color: 'bg-purple-50 border-purple-300',
    textColor: 'text-purple-800',
  },
};

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
  award: AwardCategory | null;
}

// ── Data fetching helpers ─────────────────────────────────────────────

type RawRow = { parent_chain: string; state: string; rating: number | null; review_count: number | null };

async function fetchChainRows(stateFilter?: string[]): Promise<RawRow[]> {
  const all: RawRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = supabase
      .from('listings')
      .select('parent_chain, state, rating, review_count')
      .eq('is_touchless', true)
      .eq('is_approved', true)
      .not('parent_chain', 'is', null)
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
  count: number; states: Set<string>; ratings: number[]; totalReviews: number;
}> {
  const map: Record<string, { count: number; states: Set<string>; ratings: number[]; totalReviews: number }> = {};
  for (const row of rows) {
    if (!row.parent_chain) continue;
    if (!map[row.parent_chain]) map[row.parent_chain] = { count: 0, states: new Set(), ratings: [], totalReviews: 0 };
    map[row.parent_chain].count++;
    map[row.parent_chain].states.add(row.state);
    if (row.rating != null && row.rating > 0) map[row.parent_chain].ratings.push(Number(row.rating));
    map[row.parent_chain].totalReviews += (row.review_count ?? 0);
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
      heroImage: getChainHeroImage(chain.name),
      description: chain.description.replace(/\{count\}/g, String(stats.count)),
      award: null,
    });
  }
  results.sort((a, b) => b.locationCount - a.locationCount);
  return limit ? results.slice(0, limit) : results;
}

function assignAwards(chains: RankedChain[]): void {
  if (chains.length === 0) return;
  const awarded = new Set<string>();

  // Most Locations → highest count
  chains[0].award = 'most-locations';
  awarded.add(chains[0].name);

  // Highest Rated → best avg rating, not already awarded (min 3 locations)
  const byRating = [...chains]
    .filter(c => c.avgRating != null && c.locationCount >= 3 && !awarded.has(c.name))
    .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0));
  if (byRating[0]) { byRating[0].award = 'highest-rated'; awarded.add(byRating[0].name); }

  // Widest Coverage → most states, not already awarded
  const byCoverage = [...chains]
    .filter(c => !awarded.has(c.name))
    .sort((a, b) => b.statesPresent.length - a.statesPresent.length);
  if (byCoverage[0] && byCoverage[0].statesPresent.length > 1) {
    byCoverage[0].award = 'widest-coverage';
    awarded.add(byCoverage[0].name);
  }

  // Hidden Gem → highest rated among smaller chains (below median count), not awarded
  const counts = chains.map(c => c.locationCount).sort((a, b) => a - b);
  const medianCount = counts[Math.floor(counts.length / 2)] ?? 10;
  const hiddenGemCandidates = [...chains]
    .filter(c => c.locationCount <= medianCount && c.avgRating != null && !awarded.has(c.name))
    .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0));
  if (hiddenGemCandidates[0]) {
    hiddenGemCandidates[0].award = 'hidden-gem';
  }
}

// ── Public API ────────────────────────────────────────────────────────

export async function getNationalChainRankings(): Promise<RankedChain[]> {
  const rows = await fetchChainRows();
  const map = aggregateRows(rows);
  const chains = buildRankedList(map, 5, 10);
  assignAwards(chains);
  return chains;
}

export async function getRegionalChainRankings(regionSlug: ChainRegionSlug): Promise<RankedChain[]> {
  const region = getRegionBySlug(regionSlug);
  if (!region) return [];
  const rows = await fetchChainRows(region.states);
  const map = aggregateRows(rows);
  const chains = buildRankedList(map, 3);
  assignAwards(chains);
  return chains;
}
