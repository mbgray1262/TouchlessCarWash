import { NextRequest, NextResponse } from 'next/server';

// Hard-block list: bots that ignore robots.txt or that we never want to serve.
// Matched as case-insensitive substrings of the User-Agent header. Returns 403.
// Kept separate from robots.txt because these bots routinely ignore it.
const BLOCKED_USER_AGENTS = [
  // AI training scrapers
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'Claude-Web',
  'CCBot',
  'Amazonbot',
  'Applebot-Extended',
  'Meta-ExternalAgent',
  'Bytespider',
  'Diffbot',
  'ImagesiftBot',
  'Omgilibot',
  'cohere-ai',
  // SEO competitor-intel crawlers.
  // AhrefsBot intentionally allowed: owner uses free Ahrefs for self-audits.
  // PerplexityBot and FacebookBot also intentionally allowed (AI-answer
  // traffic + Facebook ad landing-page verification).
  'SemrushBot',
  'DotBot',
  'MJ12bot',
  'DataForSeoBot',
  'PetalBot',
  'SeekportBot',
  'BLEXBot',
];

export function middleware(request: NextRequest) {
  const ua = request.headers.get('user-agent') || '';
  if (ua && BLOCKED_USER_AGENTS.some((bot) => ua.toLowerCase().includes(bot.toLowerCase()))) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const response = NextResponse.next();
  response.headers.set('x-pathname', request.nextUrl.pathname);

  // URLs that carry our redirect-banner flags (removed-listing, empty-city,
  // closed-permanently, closed-temporarily) are destination variants of the
  // 301 from an unapproved listing. The canonical tag on the destination
  // already points to the clean URL, but we also send X-Robots-Tag:
  // noindex, follow so Google explicitly skips indexing the ?from=
  // variant while still following links from it. This is Google's
  // documented pattern for "allow crawl, prevent index" (robots.txt block
  // would prevent both, which breaks 301 PageRank consolidation).
  if (request.nextUrl.searchParams.has('from')) {
    response.headers.set('X-Robots-Tag', 'noindex, follow');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
