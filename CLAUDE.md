# TouchlessCarWashFinder — engineering guardrails

## SEO integrity invariant (READ BEFORE touching routes, the sitemap, links, robots, or canonicals)

The site must always satisfy three invariants. Violating any of them caused real
production bugs (indexed-count drift, soft-404s in Search Console, leaked link
authority):

1. **In sitemap ⟺ indexable.** Every URL in `/sitemap.xml` must return HTTP 200,
   be `robots: index`, and be self-canonical. Nothing noindexed, redirecting, or
   canonical-elsewhere may appear in the sitemap.
2. **No broken internal links.** No `<a href>` rendered anywhere may resolve to a 404.
3. **No indexable page missing from the sitemap.** Any page that is itself 200 +
   index + self-canonical must be listed in the sitemap.

### Root cause of past breakage: duplicated truth

Bugs happened when the "is this page indexable?" decision (in a page component)
and the "what's in the sitemap?" decision (in `app/sitemap.xml/route.ts`) were
kept in sync **by hand** and drifted — or when two pages computed the same
threshold from two copies of the logic. The fix is always: **one shared module
that both the page and the sitemap import.** Existing shared sources of truth:

- `lib/city-resolve.ts` — slug→state code, slug→DB city name, in-city listings.
  Used by `app/state/[state]/[city]` AND `app/state/[state]/[city]/feature/[feature]`.
- `lib/state-hub-filters.ts` — `hasSubscription` / `is24h` predicates for the
  unlimited / 24-hour state hubs. Used by those pages AND the sitemap.
- `lib/feature-filters.ts` — `FEATURE_FILTERS` + `MIN_LISTINGS_FOR_FEATURE_PAGE`.
- `lib/metro-queries.ts` — `getMetroListings` / `getQualifyingMetros` (≥5 rule).
  Used by `/best/[slug]`, `/state/[state]`, AND the sitemap.

When adding a new indexable route: emit it from the sitemap using the **same**
function/threshold the page uses to decide 200-vs-404 and index-vs-noindex.

### MANDATORY before pushing any change to routes / sitemap / links / robots / canonicals

```
npm run build && npm run verify:seo
```

`verify:seo` starts the production server, runs `scripts/check-sitemap-integrity.mjs`
(which enforces all three invariants by fetching the live sitemap and crawling
internal links), then tears the server down. It exits non-zero on any violation —
do not push until it prints `✅ ALL INVARIANTS HOLD`. The crawl is bounded
(`MAX_CRAWL`, default 600) and sitemap checks are sampled per URL-shape
(`SAMPLE_PER_BUCKET`, default 25), so it is fast but not exhaustive — bump those
envs for a deeper sweep when changing core routing.

## General

- Run `npm run build` locally and fix all type/build errors before every commit.
- `is_approved = true` is the rule for a publicly-shown/indexed/sitemapped
  listing everywhere (unapproved listings 308-redirect). Non-US state values are
  invalid data — listings must have a valid US state code.
