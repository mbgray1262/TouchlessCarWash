#!/usr/bin/env node
/**
 * Sitemap & internal-link integrity checker.
 *
 * Enforces the three invariants whose violations caused real production bugs:
 *
 *   1. NO BAD URLS IN SITEMAP — every URL listed in /sitemap.xml must return
 *      HTTP 200, be robots:index, and be self-canonical. (Caught: noindex /
 *      redirecting / canonical-elsewhere URLs sitting in the sitemap.)
 *
 *   2. NO BROKEN INTERNAL LINKS — no <a href> reachable by crawling the site
 *      may resolve to a 404. (Caught: city pages linking to feature pages that
 *      always 404'd.)
 *
 *   3. NO INDEXABLE PAGE MISSING FROM SITEMAP — every crawled page that is
 *      itself indexable (200 + index + self-canonical) must appear in the
 *      sitemap. (Caught: /best/chains, /unlimited-touchless-car-wash/<state>,
 *      /touchless-satisfaction-score, etc. that were indexable but unlisted.)
 *
 * Usage:  node scripts/check-sitemap-integrity.mjs [baseUrl]
 *   baseUrl defaults to http://localhost:3000 (run `npm start` first).
 *   Exits 0 if all invariants hold, 1 (with a report) if any are violated.
 *
 * Tunables (env): MAX_CRAWL (default 600), SAMPLE_PER_BUCKET (default 25),
 *   CONCURRENCY (default 12).
 */

const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const MAX_CRAWL = Number(process.env.MAX_CRAWL || 600);
const SAMPLE_PER_BUCKET = Number(process.env.SAMPLE_PER_BUCKET || 25);
const CONCURRENCY = Number(process.env.CONCURRENCY || 12);

const SITE_HOST = 'https://touchlesscarwashfinder.com';

// ── tiny HTML extractors ──────────────────────────────────────────────
const reCanonical = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i;
const reRobots = /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i;
const reHref = /href=["'](\/[^"'#]*)["']/gi;

const canonicalOf = (html) => (html.match(reCanonical)?.[1] || '').replace(/\/$/, '');
const robotsOf = (html) => (html.match(reRobots)?.[1] || '').toLowerCase();
const isIndex = (html) => !/\bnoindex\b/.test(robotsOf(html));

/** Map a production canonical URL to the base under test, normalized. */
const toBase = (u) => u.replace(SITE_HOST, BASE).replace(/\/$/, '');
/** Map a base URL back to its production form (sitemap entries use prod host). */
const toProd = (u) => u.replace(BASE, SITE_HOST).replace(/\/$/, '');

async function fetchPage(url, { redirect = 'manual' } = {}) {
  try {
    const res = await fetch(url, { redirect, headers: { 'user-agent': 'integrity-check' } });
    const status = res.status;
    const ct = res.headers.get('content-type') || '';
    const html = ct.includes('text/html') ? await res.text() : '';
    return { status, html, location: res.headers.get('location') || '' };
  } catch (e) {
    return { status: 0, html: '', location: '', error: String(e) };
  }
}

// Run async fn over items with bounded concurrency.
async function mapPool(items, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

const bucketOf = (path) => {
  // Group by a path "shape" so we can sample big templated families.
  const segs = path.split('/').filter(Boolean);
  if (segs.length === 0) return '/(root)';
  if (segs[0] === 'state') return `state/${segs.length}seg`;
  if (segs[0] === 'features') return `features/${segs.length}seg`;
  if (segs[0] === 'best') return `best/${segs.length}seg`;
  return segs[0];
};

const sampleByBucket = (paths, n) => {
  const groups = new Map();
  for (const p of paths) {
    const b = bucketOf(p);
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(p);
  }
  const picked = [];
  for (const [, arr] of groups) {
    // deterministic spread sample
    const step = Math.max(1, Math.floor(arr.length / n));
    for (let k = 0; k < arr.length && picked.length - 0 < Infinity; k += step) {
      picked.push(arr[k]);
      if (picked.filter((x) => bucketOf(x) === bucketOf(arr[k])).length >= n) break;
    }
  }
  return picked;
};

async function main() {
  console.log(`\nSitemap integrity check against ${BASE}\n${'='.repeat(50)}`);

  // ── Load sitemap ────────────────────────────────────────────────────
  const sm = await fetchPage(`${BASE}/sitemap.xml`, { redirect: 'follow' });
  if (sm.status !== 200) {
    console.error(`FATAL: /sitemap.xml returned ${sm.status}`);
    process.exit(1);
  }
  const smXml = sm.html || (await (await fetch(`${BASE}/sitemap.xml`)).text());
  const sitemapUrls = [...smXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/\/$/, ''));
  const sitemapSet = new Set(sitemapUrls.map(toProd));
  console.log(`Sitemap URLs: ${sitemapUrls.length}`);

  const failures = { badInSitemap: [], brokenLinks: [], missingFromSitemap: [] };

  // ── INVARIANT 1: every sitemap URL is 200 + index + self-canonical ──
  const smPaths = sitemapUrls.map((u) => toBase(u).replace(BASE, ''));
  const smSample = sampleByBucket(smPaths, SAMPLE_PER_BUCKET);
  console.log(`\n[1/3] Checking ${smSample.length} sampled sitemap URLs are indexable...`);
  await mapPool(smSample, async (path) => {
    const url = `${BASE}${path}`;
    const { status, html } = await fetchPage(url);
    const canon = canonicalOf(html);
    const selfCanon = canon === toProd(url) || canon === url;
    if (status !== 200 || !isIndex(html) || !selfCanon) {
      failures.badInSitemap.push(`${path}  (status=${status} index=${isIndex(html)} canon=${canon || 'none'})`);
    }
  });

  // ── Crawl (bounded BFS) for invariants 2 & 3 ────────────────────────
  console.log(`\n[2-3/3] Crawling up to ${MAX_CRAWL} pages from internal links...`);
  const seeds = [
    '/', '/states', '/best', '/best/chains', '/chains', '/features', '/equipment',
    '/videos', '/dataset', '/touchless-satisfaction-score', '/shop',
    '/unlimited-touchless-car-wash', '/24-hour-touchless-car-wash',
  ];
  const seen = new Set();
  const queue = [];
  const enqueue = (p) => {
    const clean = p.replace(/\/$/, '') || '/';
    if (seen.has(clean)) return;
    if (/^\/(api|admin|_next)\b/.test(clean)) return;
    seen.add(clean);
    queue.push(clean);
  };
  seeds.forEach(enqueue);

  let crawled = 0;
  while (queue.length && crawled < MAX_CRAWL) {
    const batch = queue.splice(0, CONCURRENCY);
    await mapPool(batch, async (path) => {
      crawled++;
      const url = `${BASE}${path}`;
      const { status, html } = await fetchPage(url, { redirect: 'manual' });

      // INVARIANT 3: indexable + self-canonical pages must be in the sitemap.
      if (status === 200 && html && isIndex(html)) {
        const canon = canonicalOf(html);
        const selfCanon = canon === toProd(url) || canon === url;
        if (selfCanon && !sitemapSet.has(toProd(url))) {
          failures.missingFromSitemap.push(`${path}  (indexable + self-canonical, not in sitemap)`);
        }
      }

      // Extract internal links → check for 404s (invariant 2) and enqueue.
      if (status === 200 && html) {
        const links = new Set([...html.matchAll(reHref)].map((m) => m[1]));
        for (const l of links) {
          const clean = l.replace(/\/$/, '') || '/';
          if (/^\/(api|admin|_next)\b/.test(clean)) continue;
          if (crawled + queue.length < MAX_CRAWL) enqueue(clean);
        }
      }
    });
  }
  console.log(`Crawled ${crawled} pages.`);

  // INVARIANT 2: re-verify every discovered internal link resolves (no 404).
  // (Following redirects: a link is "broken" only if it ultimately 404s.)
  const allLinks = [...seen];
  console.log(`\nChecking ${allLinks.length} discovered links resolve (no 404)...`);
  await mapPool(allLinks, async (path) => {
    const { status } = await fetchPage(`${BASE}${path}`, { redirect: 'follow' });
    if (status === 404) failures.brokenLinks.push(`${path}  (-> 404)`);
  });

  // ── Report ──────────────────────────────────────────────────────────
  const report = (title, arr) => {
    console.log(`\n${arr.length === 0 ? 'PASS' : 'FAIL'} — ${title}: ${arr.length} issue(s)`);
    arr.slice(0, 40).forEach((x) => console.log(`   • ${x}`));
    if (arr.length > 40) console.log(`   …and ${arr.length - 40} more`);
  };
  console.log(`\n${'='.repeat(50)}\nRESULTS`);
  report('Bad URLs in sitemap (not 200/index/self-canonical)', failures.badInSitemap);
  report('Broken internal links (resolve to 404)', failures.brokenLinks);
  report('Indexable pages missing from sitemap', failures.missingFromSitemap);

  const total = failures.badInSitemap.length + failures.brokenLinks.length + failures.missingFromSitemap.length;
  console.log(`\n${total === 0 ? '✅ ALL INVARIANTS HOLD' : `❌ ${total} INTEGRITY VIOLATION(S)`}\n`);
  process.exit(total === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('check failed to run:', e);
  process.exit(1);
});
