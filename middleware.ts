import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('x-pathname', request.nextUrl.pathname);

  // Soft-404 redirect destinations carry ?from=removed-listing / ?from=empty-city
  // / ?from=closed-permanently / ?from=closed-temporarily so the landing page can
  // show a friendly banner. Tell Google not to index the parameterized variant —
  // the clean canonical URL is already in the sitemap and should be the one
  // that ranks. Cannot block via robots.txt because Googlebot needs to follow
  // the 308 redirect from the origin listing URL; blocking the destination
  // causes GSC to flag the chain as "Blocked by robots.txt".
  if (request.nextUrl.searchParams.has('from')) {
    response.headers.set('X-Robots-Tag', 'noindex, follow');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
