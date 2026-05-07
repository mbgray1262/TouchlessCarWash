/**
 * GET /api/badge/chain/[slug]?scope=national|midwest|pacific|northeast|southeast|mountain-west&theme=dark&size=standard
 *
 * Slug-based dynamic chain badge API. Looks up the chain's current rank at
 * request time so the badge always reflects the latest data — even if a chain
 * moves up or down the leaderboard between embed code installations.
 *
 * Rank 1–3  → positional gold/silver/bronze badge
 * Rank 4–10 (national only) → "Top 10" teal consolation badge
 * Not ranked / rank > 10    → 404
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getNationalChainRankings,
  getRegionalChainRankings,
  getRegionBySlug,
} from '@/lib/chain-rankings';
import { generateChainBadgeSvg } from '@/lib/chain-badge-svg';
import { generateTop10ChainBadgeSvg } from '@/lib/chain-badge-svg';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);

  const scope = searchParams.get('scope') ?? 'national';
  const theme = searchParams.get('theme') === 'light' ? 'light' : 'dark';
  const size = searchParams.get('size') === 'compact' ? 'compact' : 'standard';
  const year = new Date().getFullYear();

  let rank = -1;
  let scopeName = 'America';

  if (scope === 'national') {
    const chains = await getNationalChainRankings();
    const idx = chains.findIndex((c) => c.slug === slug);
    if (idx === -1 || idx >= 10) {
      return new NextResponse('Chain not in top 10', { status: 404 });
    }
    rank = idx + 1;
    scopeName = 'America';
  } else {
    // Regional scope
    const region = getRegionBySlug(scope);
    if (!region) {
      return new NextResponse('Unknown region', { status: 404 });
    }
    const chains = await getRegionalChainRankings(scope as Parameters<typeof getRegionalChainRankings>[0]);
    const idx = chains.findIndex((c) => c.slug === slug);
    if (idx === -1 || idx >= 3) {
      // Regional consolation badges not issued — top 3 only for regions
      return new NextResponse('Chain not in regional top 3', { status: 404 });
    }
    rank = idx + 1;
    scopeName = region.shortName;
  }

  // Generate SVG
  const svg =
    rank <= 3
      ? generateChainBadgeSvg({ rank, scopeName, year, theme, size })
      : generateTop10ChainBadgeSvg({ scopeName, year, theme, size });

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control':
        'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
