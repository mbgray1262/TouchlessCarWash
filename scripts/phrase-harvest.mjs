#!/usr/bin/env node
/**
 * Per-state phrase harvest — systematizes the "search Google for touchless
 * locations" discovery idea.
 *
 * For each US state we run plain Google WEB searches (engine=google, NOT maps)
 * for locator-page phrases scoped to that state. Pages that literally list
 * multiple touchless/touch-free locations are almost always chain store-locator
 * pages. We collect organic-result domains, filter aggregators, dedupe against
 * the websites already in our DB, and emit a RANKED worklist of car-wash
 * domains we don't yet have — ordered by how many states/queries surfaced them
 * (multi-state appearance ≈ a real multi-location chain worth reconciling).
 *
 * Cost: (states × phrases) SerpAPI credits. Default 51 × 2 = 102 credits.
 * Read-only on the DB. Output: scripts/discovery-output/phrase-harvest.json
 *                              scripts/discovery-output/phrase-harvest.txt
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const i = l.indexOf('='); if (i > 0) a[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return a; }, {});

const apiKey = env.SERPAPI_KEY;
if (!apiKey) { console.error('Missing SERPAPI_KEY'); process.exit(1); }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming','District of Columbia'];

// Phrase templates — {STATE} substituted. Two brandings cover the variance
// (Google loosely matches touch-free/touch free/touchfree; brushless adds reach).
const PHRASES = [
  'touchless car wash locations {STATE}',
  'touch free car wash locations {STATE}',
];

const SKIP_DOMAIN = /(google\.|yelp\.|facebook\.|yellowpages\.|mapquest\.|tripadvisor\.|foursquare\.|bbb\.org|wikipedia\.|youtube\.|reddit\.|instagram\.|twitter\.|x\.com|carwash\.org|touchlesscarwashfinder|amazon\.|tiktok\.|pinterest\.|linkedin\.|apple\.com|bing\.|nextdoor\.|angi\.|thumbtack\.|groupon\.|cars\.com|caranddriver\.|cargurus\.|car\.com|autotrader\.|carbuzz\.|kbb\.com|edmunds\.|carfax\.|indeed\.|glassdoor\.|ziprecruiter\.|expedia\.|booking\.|opentable\.|grubhub\.|doordash\.|patch\.com|loopnet\.|costar\.|zillow\.|realtor\.|apartments\.com|gasbuddy\.)/i;

const norm = (h) => h.replace(/^www\./, '').toLowerCase();
const hostOf = (u) => { try { return norm(new URL(u).hostname); } catch { return null; } };

console.log('Loading existing websites from DB...');
const haveDomains = new Set();
for (let off = 0; off < 40000; off += 1000) {
  const { data, error } = await sb.from('listings').select('website').not('website', 'is', null).range(off, off + 999);
  if (error) { console.error(error); break; }
  if (!data || data.length === 0) break;
  for (const r of data) { const h = hostOf(r.website); if (h) haveDomains.add(h); }
  if (data.length < 1000) break;
}
console.log(`  ${haveDomains.size} distinct domains already in DB\n`);

const found = new Map(); // domain -> { states:Set, queries:Set, titles:Set, sampleUrl }
let credits = 0, errors = 0;
const started = Date.now();

for (const state of STATES) {
  for (const tpl of PHRASES) {
    const q = tpl.replace('{STATE}', state);
    const params = new URLSearchParams({ engine: 'google', q, num: '20', gl: 'us', hl: 'en', api_key: apiKey });
    try {
      const res = await fetch(`https://serpapi.com/search.json?${params}`);
      credits++;
      if (!res.ok) { errors++; continue; }
      const json = await res.json();
      for (const r of (json.organic_results || [])) {
        const h = hostOf(r.link);
        if (!h || SKIP_DOMAIN.test(h)) continue;
        if (!found.has(h)) found.set(h, { states: new Set(), queries: new Set(), titles: new Set(), sampleUrl: r.link });
        const e = found.get(h);
        e.states.add(state); e.queries.add(q); if (r.title) e.titles.add(r.title);
      }
    } catch (e) { errors++; }
  }
  const done = STATES.indexOf(state) + 1;
  if (done % 5 === 0) console.log(`  ${done}/${STATES.length} states · ${credits} credits · ${found.size} domains · ${((Date.now()-started)/1000).toFixed(0)}s`);
}

const rows = [];
for (const [domain, e] of found) {
  if (haveDomains.has(domain)) continue; // already have it
  rows.push({
    domain,
    states: Array.from(e.states).sort(),
    stateCount: e.states.size,
    queryCount: e.queries.size,
    title: Array.from(e.titles)[0] || '',
    sampleUrl: e.sampleUrl,
  });
}
rows.sort((a, b) => b.stateCount - a.stateCount || b.queryCount - a.queryCount);

const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${apiKey}`)).json();
const outDir = new URL('./discovery-output/', import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL('phrase-harvest.json', outDir), JSON.stringify({
  generatedAt: new Date().toISOString(), credits, errors,
  states: STATES.length, phrases: PHRASES,
  existingDomains: haveDomains.size,
  candidatesNotInDb: rows.length, rows,
}, null, 2));

const txt = [
  `Per-state phrase harvest — ${new Date().toISOString()}`,
  `${credits} credits used (${acct.plan_searches_left ?? '?'} left), ${errors} errors`,
  `${rows.length} car-wash domains surfaced that are NOT in our DB (by website domain)`,
  ``,
  `RANKED (multi-state first = likeliest real chains):`,
  ...rows.map(r => `  [${r.stateCount}st/${r.queryCount}q] ${r.domain}  — ${r.title.slice(0,60)}  (${r.states.slice(0,6).join(',')}${r.states.length>6?'…':''})`),
].join('\n');
writeFileSync(new URL('phrase-harvest.txt', outDir), txt);

console.log(`\n=== DONE: ${credits} credits, ${acct.plan_searches_left ?? '?'} left ===`);
console.log(`Candidates NOT in DB: ${rows.length}`);
console.log(`\nTop 30 by state coverage:`);
for (const r of rows.slice(0, 30)) console.log(`  [${r.stateCount}st] ${r.domain}  — ${r.title.slice(0,55)}`);
console.log(`\nFull worklist: scripts/discovery-output/phrase-harvest.txt`);
