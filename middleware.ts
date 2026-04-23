import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
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
