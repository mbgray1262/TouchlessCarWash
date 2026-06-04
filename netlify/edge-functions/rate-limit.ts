// Per-IP rate limit (Netlify code-based rate limiting — works on all plans).
//
// Stops the aggressive bot/scraper BURSTS that were causing the sharp GA traffic
// spikes: any single IP making more than 100 requests in 60 seconds to a content
// page gets a 429 (blocked). That's very generous for a real visitor — including
// opening multiple tabs and Next.js link prefetching — so legitimate traffic is
// unaffected, while a scraper hammering pages in a burst is cut off immediately.
//
// Scope: real content routes only (home, state/city/listing, search, best-of,
// chains, features, paint-safe). Static assets (/_next/*) and APIs are excluded.
//
// NOTE: this catches FAST bursts. A slow, paced scraper that stays under 100/min
// can still slip through — Cloudflare Bot Fight Mode (free) is the complementary
// layer that challenges automated traffic regardless of rate.
//
// Types are provided by Netlify's edge runtime at deploy time; we avoid importing
// @netlify/edge-functions here so the Next.js build stays clean.

export default async (_request: Request, context: { next: () => Promise<Response> }) => {
  return context.next(); // pass through — the rate limit is enforced by the platform via `config` below
};

export const config = {
  path: [
    '/',
    '/state/*',
    '/search',
    '/best/*',
    '/chain/*',
    '/chains',
    '/states',
    '/paint-safe',
    '/unlimited-touchless-car-wash/*',
    '/features/*',
  ],
  excludedPath: ['/_next/*', '/api/*'],
  rateLimit: {
    windowLimit: 100,
    windowSize: 60, // seconds (max 180)
    aggregateBy: ['ip', 'domain'],
  },
};
