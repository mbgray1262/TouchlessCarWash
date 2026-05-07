import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateBadgeSvg, generateTop10BadgeSvg } from '@/lib/badge-svg';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);

  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const size = searchParams.get('size') === 'compact' ? 'compact' : 'standard';

  // 1. Fetch listing by slug
  const { data: listing } = await supabase
    .from('listings')
    .select('id, name, city, state')
    .eq('slug', slug)
    .maybeSingle();

  if (!listing) {
    return new NextResponse('Listing not found', { status: 404 });
  }

  // 2. Fetch best ranking (lowest rank number = best position)
  const { data: rankings } = await supabase
    .from('best_of_rankings')
    .select('metro_slug, metro_name, rank')
    .eq('listing_id', listing.id)
    .order('rank', { ascending: true })
    .limit(1);

  if (!rankings || rankings.length === 0) {
    return new NextResponse('Listing is not ranked', { status: 404 });
  }

  const ranking = rankings[0];

  // Rank > 10 → no badge (too far down the list to be meaningful)
  if (ranking.rank > 10) {
    return new NextResponse('Listing rank is outside top 10', { status: 404 });
  }

  const year = new Date().getFullYear();

  // 3. Generate appropriate SVG
  //    Rank 1–3 → gold/silver/bronze positional badge
  //    Rank 4–10 → teal "Top 10" consolation badge
  const svg =
    ranking.rank <= 3
      ? generateBadgeSvg({ rank: ranking.rank, metroName: ranking.metro_name, year, theme, size })
      : generateTop10BadgeSvg({ metroName: ranking.metro_name, year, theme, size });

  // 4. Return SVG with caching + CORS headers
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control':
        'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
