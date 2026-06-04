// Per-IP rate limit (Netlify code-based rate limiting — works on all plans).
//
// Stops the aggressive bot/scraper BURSTS that were causing the sharp GA traffic
// spikes: any single IP making more than 60 requests in 60 seconds to a content
// page gets a 429 (blocked). 60/min leaves headroom for a real visitor — Next.js
// prefetches links on scroll (a listing-dense page can fire dozens of background
// requests) and shared IPs (offices/carriers) aggregate many users — while a
// scraper hammering pages in a burst is cut off. Going much below 60 risks
// false-positives on engaged real users, so 60 is the floor.
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
    windowLimit: 60,
    windowSize: 60, // seconds (max 180)
    aggregateBy: ['ip', 'domain'],
  },
};
