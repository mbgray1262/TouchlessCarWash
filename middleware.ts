import { NextRequest, NextResponse } from 'next/server';

// Geo block: this directory only covers US car washes, so any request from
// Asia / Middle East / Central Asia is overwhelmingly likely to be a bot
// or scraper rather than a real user. Netlify populates request.geo.country
// (and falls back to the x-nf-geo base64 header). Search engines that
// matter (Google, Bing, Apple, DuckDuckGo) crawl from US-based IP ranges,
// so this does not affect SEO.
const BLOCKED_COUNTRIES = new Set([
  // East Asia
  'CN', 'HK', 'MO', 'JP', 'KR', 'KP', 'TW', 'MN',
  // Southeast Asia
  'SG', 'MY', 'TH', 'VN', 'PH', 'ID', 'BN', 'KH', 'LA', 'MM', 'TL',
  // South Asia
  'IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV', 'AF',
  // Central Asia
  'KZ', 'KG', 'TJ', 'TM', 'UZ',
  // Middle East
  'AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'YE', 'IR', 'IQ', 'SY',
  'LB', 'JO', 'IL', 'PS', 'TR', 'AM', 'AZ', 'GE',
]);

function getCountryCode(request: NextRequest): string | null {
  // Next.js standard geo (Netlify plugin populates this)
  const ngeo = (request as unknown as { geo?: { country?: string } }).geo;
  if (ngeo?.country) return ngeo.country.toUpperCase();
  // Netlify raw header — base64-encoded JSON
  const raw = request.headers.get('x-nf-geo');
  if (raw) {
    try {
      const decoded = JSON.parse(
        typeof atob === 'function' ? atob(raw) : Buffer.from(raw, 'base64').toString('utf-8'),
      );
      const code = decoded?.country?.code;
      if (typeof code === 'string') return code.toUpperCase();
    } catch { /* fall through */ }
  }
  // Generic Cloudflare/CDN fallbacks (harmless if absent)
  return request.headers.get('x-country')?.toUpperCase()
    || request.headers.get('cf-ipcountry')?.toUpperCase()
    || null;
}

// Search-engine bots we ALWAYS allow regardless of country. Belt-and-
// suspenders — Googlebot etc. crawl from US ranges so the geo block
// shouldn't catch them, but if a Google reviewer (e.g. AdSense manual
// review) hits the site from an international office we want them through.
// Matches case-insensitive substrings of the User-Agent.
const ALWAYS_ALLOW_BOT_UAS = [
  'Googlebot',
  'Google-InspectionTool',  // Google Search Console manual inspection
  'AdsBot-Google',          // Google Ads landing-page quality + AdSense
  'Mediapartners-Google',   // AdSense content crawler
  'Storebot-Google',        // Google Merchant
  'Bingbot',
  'BingPreview',
  'DuckDuckBot',
  'Applebot',               // Apple search — note: -Extended is blocked above
  'YandexBot',
  'facebookexternalhit',    // FB/IG link previews
  'Twitterbot',
  'LinkedInBot',
  'Slackbot',
  'Discordbot',
  'AhrefsBot',              // owner uses for self-audits
  'PerplexityBot',
];

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
  const { pathname } = request.nextUrl;

  // ── Permanent redirects for known dead URL patterns ──────────────────────

  // 1. Double-slash listing URLs: /state/XX//slug (city segment missing).
  //    These were generated for Kwik-Trip and other chain listings whose city
  //    field was blank. Google crawled ~84 of them. Redirect to the state hub.
  if (/^\/state\/[^/]+\/\//.test(pathname)) {
    const stateSegment = pathname.split('/')[2];
    return NextResponse.redirect(
      new URL(`/state/${stateSegment}`, request.url),
      { status: 308 },
    );
  }

  // 2. /features/self-serve-bays/[state] — old feature that no longer exists.
  //    Google has ~38 of these indexed. Redirect to the open-24-hours feature
  //    hub which is the closest relevant replacement.
  if (pathname.startsWith('/features/self-serve-bays')) {
    return NextResponse.redirect(
      new URL('/features/open-24-hours', request.url),
      { status: 308 },
    );
  }

  // ── Bot filtering ─────────────────────────────────────────────────────────

  const ua = request.headers.get('user-agent') || '';
  const uaLower = ua.toLowerCase();
  const isAllowedSearchBot = ALWAYS_ALLOW_BOT_UAS.some(
    (bot) => uaLower.includes(bot.toLowerCase()),
  );

  if (ua && !isAllowedSearchBot && BLOCKED_USER_AGENTS.some(
    (bot) => uaLower.includes(bot.toLowerCase()),
  )) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (!isAllowedSearchBot) {
    const country = getCountryCode(request);
    if (country && BLOCKED_COUNTRIES.has(country)) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  const response = NextResponse.next();
  response.headers.set('x-pathname', pathname);

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
