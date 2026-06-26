import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateBadgeSvg, generateTop10BadgeSvg } from '@/lib/badge-svg';
import { earnsTrophy } from '@/lib/metro-scoring';

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
    .select('id, name, city, state, touchless_satisfaction_score')
    .eq('slug', slug)
    .maybeSingle();

  if (!listing) {
    return new NextResponse('Listing not found', { status: 404 });
  }

  // No badge image for a ranked-but-below-"Good" wash (see earnsTrophy): it
  // keeps its /best listing but doesn't earn a displayable trophy.
  if (!earnsTrophy(listing)) {
    return new NextResponse('Listing has not earned a badge', { status: 404 });
  }

  // 2. Fetch best ranking (lowest rank number = best position)
  const { data: rankings } = await supabase
    .from('best_of_rankings')
    .select('metro_slug, metro_name, rank, computed_at')
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

  // Freeze the badge to the year it was AWARDED (computed_at), not the live
  // current year — an award badge an owner embeds must not silently flip to a
  // new year. Falls back to current year only if computed_at is somehow missing.
  const year = ranking.computed_at
    ? new Date(ranking.computed_at).getFullYear()
    : new Date().getFullYear();

  // 3. Generate appropriate SVG
  //    Rank 1–3 → gold/silver/bronze positional badge
  //    Rank 4–10 → teal "Top 10" consolation badge
  const svg =
    ranking.rank <= 3
      ? generateBadgeSvg({ rank: ranking.rank, metroName: ranking.metro_name, year, theme, size })
      : generateTop10BadgeSvg({ metroName: ranking.metro_name, year, theme, size });

  // Backlink tracking: record the external site embedding this badge. Best-effort
  // and wrapped — it must NEVER break or slow the image meaningfully. Dedupes by
  // (slug, domain); bumps last_seen on repeat loads. Cached badge → fires only on
  // cache-miss, which is plenty to detect that a site has embedded it.
  const referer = request.headers.get('referer') || '';
  if (referer) {
    try {
      const host = new URL(referer).hostname.replace(/^www\./, '');
      // Only record real, public, external hosts. Excludes our own site,
      // localhost / single-label hosts, *.local, and loopback/private IPs so a
      // local dev/preview load never creates a phantom "backlink".
      const isPrivate = !host.includes('.') // localhost & other single-label hosts
        || host.endsWith('.local')
        || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
        || host.endsWith('touchlesscarwashfinder.com');
      if (host && !isPrivate) {
        await supabase.from('badge_embeds').upsert(
          { listing_slug: slug, referer_domain: host, referer_url: referer.slice(0, 500), last_seen: new Date().toISOString() },
          { onConflict: 'listing_slug,referer_domain' },
        );
      }
    } catch {
      // ignore — tracking must never break the badge image
    }
  }

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
