/**
 * GET /api/badge/chain?rank=1&scope=America&theme=dark&size=standard
 *
 * Generates a chain award badge SVG. Parameters are passed explicitly
 * so the embed code is self-contained and doesn't require a DB lookup —
 * mirrors the same philosophy as /api/badge/[slug] for individual listings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateChainBadgeSvg } from '@/lib/chain-badge-svg';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const rankParam = parseInt(searchParams.get('rank') ?? '1', 10);
  const rank = [1, 2, 3].includes(rankParam) ? rankParam : 1;

  const scope = (searchParams.get('scope') ?? 'America').slice(0, 60);

  const theme = searchParams.get('theme') === 'light' ? 'light' : 'dark';
  const size = searchParams.get('size') === 'compact' ? 'compact' : 'standard';

  const year = new Date().getFullYear();

  const svg = generateChainBadgeSvg({ rank, scopeName: scope, year, theme, size });

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
