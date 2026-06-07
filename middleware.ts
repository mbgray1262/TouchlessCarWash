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

// Distinguishes a real human browser from a cheap scraper for the geo-block.
// Real browsers (Chrome/Safari/Firefox/Edge) always send Accept-Language plus
// the Sec-Fetch-* / Sec-CH-UA hint headers on navigation and fetch; bare
// scrapers (python-requests, curl, naive axios) almost never send Sec-Fetch.
// This lets a human reviewer in a blocked region (e.g. an overseas Amazon
// Associates / ad-network reviewer) through while still dropping the bulk of
// the volume bot traffic the geo-block was added to stop.
function looksLikeRealBrowser(request: NextRequest): boolean {
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  if (!ua.includes('mozilla')) return false;
  const hasAcceptLanguage = !!request.headers.get('accept-language');
  const hasSecFetch = !!(
    request.headers.get('sec-fetch-mode')
    || request.headers.get('sec-fetch-site')
    || request.headers.get('sec-fetch-dest')
  );
  const hasSecChUa = !!request.headers.get('sec-ch-ua');
  return hasAcceptLanguage && (hasSecFetch || hasSecChUa);
}

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

// ── Edge caching for public, non-personalized pages ────────────────────────
// Every page is `force-dynamic` (deliberately — it sidesteps the Next.js ISR
// "304-without-body" bug that kept breaking /blog and /best on the CDN).
// But force-dynamic makes Next emit `cache-control: no-store`, and netlify.toml
// [[headers]] do NOT apply to dynamically-rendered routes — so the CDN cache
// the toml describes was silently bypassed (`cache-status: fwd=bypass`) and
// EVERY request did a full server render + Supabase query. That's the slow TTFB
// Ahrefs flagged.
//
// Headers set here in middleware ARE honored by Netlify's CDN, so this is where
// the cache directive has to live. Result: ~500ms TTFB → ~20-50ms on cache
// hits, plus far fewer Supabase/function invocations. purgeCache() in
// /api/revalidate still clears these instantly on admin edits.
//
// We only cache GET requests with NO query string, because Netlify's default
// cache key (netlify-vary) ignores arbitrary query params like ?page= / ?model=
// — caching those would collide variants. Query-driven pages stay uncached
// (still work, just not edge-accelerated). Personalized/private routes are
// excluded outright: "/" personalizes by visitor geo (nearest-metro), and
// /search, /favorites, /add-listing, /contact, /admin, /api are dynamic.
const CDN_CACHE_VALUE = 'public, s-maxage=3600, stale-while-revalidate=86400, durable';

const NEVER_CACHE_PREFIXES = ['/api', '/admin', '/search', '/favorites', '/add-listing', '/contact'];
const CACHEABLE_PREFIXES = [
  '/state', '/best', '/blog', '/chain', '/chains', '/states',
  '/features', '/equipment', '/badge', '/shop', '/about',
  '/paint-safe', '/touchless-satisfaction-score', '/laser-car-wash',
  '/24-hour-touchless-car-wash', '/unlimited-touchless-car-wash',
  '/dataset', '/compare', '/videos', '/privacy-policy', '/terms-of-service',
];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isCacheablePath(pathname: string): boolean {
  if (pathname === '/') return false; // geo-personalized homepage
  if (matchesPrefix(pathname, NEVER_CACHE_PREFIXES)) return false;
  return matchesPrefix(pathname, CACHEABLE_PREFIXES);
}

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

  if (!isAllowedSearchBot && !looksLikeRealBrowser(request)) {
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

  // Engage the Netlify edge cache for public, non-personalized pages (see note
  // above CDN_CACHE_VALUE). Only GET + no query string, so we never collide
  // query variants Netlify doesn't key on.
  if (request.method === 'GET' && request.nextUrl.search === '' && isCacheablePath(pathname)) {
    response.headers.set('Netlify-CDN-Cache-Control', CDN_CACHE_VALUE);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
