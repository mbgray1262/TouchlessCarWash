/**
 * check-blank-pages.mjs — detects the "blank page" CDN cache-wedge bug.
 *
 * Symptom: a page's brotli-compressed variant gets stuck returning a bodyless
 * 304 at the CDN, so real browsers (which request brotli) render a BLANK page,
 * while curl (uncompressed) sees a healthy 200. Root cause was Next.js ETags
 * (fixed via generateEtags:false), but this is the safety-net that catches any
 * page that still wedges.
 *
 * Method: request each URL exactly like a browser navigation (Accept-Encoding:
 * br) and flag anything that is NOT 200-with-body (a 304, or an empty body).
 *
 * Usage:
 *   node scripts/check-blank-pages.mjs                 # sample from sitemap, report only
 *   node scripts/check-blank-pages.mjs --sample 300    # bigger sample
 *   node scripts/check-blank-pages.mjs --all           # every sitemap URL
 *   node scripts/check-blank-pages.mjs --fix           # auto-purge any wedged page via /api/revalidate
 */
const BASE = 'https://touchlesscarwashfinder.com';
const args = process.argv.slice(2);
const SAMPLE = args.includes('--all') ? Infinity : Number((args.find(a => a.startsWith('--sample'))?.split(/[= ]/)[1]) || 250);
const FIX = args.includes('--fix');
const CONC = 12;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

async function getText(url) { const r = await fetch(url, { headers: { 'User-Agent': UA } }); return r.ok ? r.text() : ''; }

async function collectUrls() {
  const idx = await getText(`${BASE}/sitemap.xml`);
  const subs = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  // sitemap.xml may be an index (points to child sitemaps) or a flat url list
  const childSitemaps = subs.filter(u => /\.xml(\?|$)/i.test(u));
  let urls = subs.filter(u => !/\.xml(\?|$)/i.test(u));
  for (const sm of childSitemaps) {
    const body = await getText(sm);
    urls.push(...[...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
  }
  urls = Array.from(new Set(urls));
  // prioritize listing detail pages (the ones that wedge), then everything else
  const listings = urls.filter(u => /\/state\/[^/]+\/[^/]+\/[^/]+$/.test(u));
  const rest = urls.filter(u => !listings.includes(u));
  return { listings, rest, total: urls.length };
}

async function checkOne(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Encoding': 'br, gzip', 'Accept': 'text/html', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' },
      redirect: 'manual',
    });
    if (r.status >= 300 && r.status < 400) return { url, ok: true, note: `redirect ${r.status}` }; // redirects are fine (not a blank page)
    const body = await r.arrayBuffer();
    const wedged = r.status === 304 || body.byteLength === 0;
    return { url, ok: !wedged, status: r.status, bytes: body.byteLength };
  } catch (e) { return { url, ok: false, status: 'ERR', note: e.message }; }
}

async function pool(items, fn, conc) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); } }));
  return out;
}

(async () => {
  const { listings, rest, total } = await collectUrls();
  let targets = [...listings, ...rest];
  if (Number.isFinite(SAMPLE)) targets = targets.slice(0, SAMPLE);
  console.log(`sitemap URLs: ${total} (listings: ${listings.length}) | checking: ${targets.length} (brotli navigation requests)`);
  const results = await pool(targets, checkOne, CONC);
  const wedged = results.filter(r => !r.ok);
  console.log(`\n✅ healthy: ${results.length - wedged.length} | ❌ WEDGED (blank-page bug): ${wedged.length}`);
  for (const w of wedged) console.log(`   ❌ ${w.status} ${w.bytes ?? ''} ${w.url}`);

  if (!FIX) process.exit(wedged.length ? 1 : 0);

  if (!wedged.length) { console.log('\nnothing to fix.'); process.exit(0); }
  console.log(`\n--fix: purging ${wedged.length} wedged page(s) via /api/revalidate...`);
  // Forward-compatible with a future auth token on /api/revalidate: send it if set.
  const revHeaders = { 'Content-Type': 'application/json' };
  if (process.env.REVALIDATE_SECRET) revHeaders['x-revalidate-secret'] = process.env.REVALIDATE_SECRET;
  for (const w of wedged) {
    try {
      await fetch(`${BASE}/api/revalidate`, { method: 'POST', headers: revHeaders, body: JSON.stringify({ path: new URL(w.url).pathname }) });
    } catch { /* re-check below is the source of truth */ }
  }
  await new Promise(r => setTimeout(r, 4000)); // let the purge propagate
  const recheck = await pool(wedged.map(w => w.url), checkOne, CONC);
  const stillWedged = recheck.filter(r => !r.ok);
  console.log(`re-check after purge: ${recheck.length - stillWedged.length} healed, ${stillWedged.length} STILL wedged`);
  for (const w of stillWedged) console.log(`   ❌ still wedged: ${w.url}`);
  // Only "fail" (alert) if auto-fix could NOT resolve it — otherwise a clean self-heal.
  process.exit(stillWedged.length ? 1 : 0);
})();
