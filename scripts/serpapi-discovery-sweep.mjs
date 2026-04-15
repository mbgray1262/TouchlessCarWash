#!/usr/bin/env node
/**
 * SerpAPI Google Maps discovery sweep.
 *
 * Queries engine=google_maps across all 103 metros in lib/metro-areas.ts with
 * 3 query variants per metro (touchless / laser / brushless car wash). Dedupes
 * returned place_ids against our existing listings and writes a CSV of
 * candidate NEW listings for spot-check before import.
 *
 * Cost: 309 credits total (103 metros × 3 queries).
 * Outputs: scripts/discovery-output/serpapi-new-candidates.csv
 *          scripts/discovery-output/serpapi-raw-results.json (for debugging)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envCandidates = [
  resolve(repoRoot, '.env.local'),
  '/Users/michaelgray/Projects/TouchlessCarWash/.env.local',
];
const envPath = envCandidates.find(p => { try { readFileSync(p, 'utf8'); return true; } catch { return false; } });
const env = readFileSync(envPath, 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...r] = l.split('='); if (k) a[k.trim()] = r.join('=').trim(); return a; }, {});

const apiKey = env.SERPAPI_KEY;
if (!apiKey) { console.error('Missing SERPAPI_KEY'); process.exit(1); }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Import METRO_AREAS by reading the TS file (quick regex parse — we just need lat/lng/slug/name)
const metroFile = readFileSync(resolve(repoRoot, 'lib/metro-areas.ts'), 'utf8');
// Parse objects like: { name: 'Miami', displayName: 'Miami, FL', slug: 'miami', lat: 25.7617, lng: -80.1918, ...
const metros = [];
const entryRe = /\{\s*name:\s*'([^']+)',\s*displayName:\s*'([^']+)',\s*slug:\s*'([^']+)',\s*lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+),/g;
let m;
while ((m = entryRe.exec(metroFile)) !== null) {
  metros.push({ name: m[1], displayName: m[2], slug: m[3], lat: parseFloat(m[4]), lng: parseFloat(m[5]) });
}
console.log(`Parsed ${metros.length} metros`);
if (metros.length === 0) { console.error('Failed to parse metros'); process.exit(1); }

const QUERIES = ['touchless car wash', 'laser car wash', 'brushless car wash'];
const ZOOM = 12; // ~8-mile radius

// Fetch existing google_place_ids from DB (paginated past 1000-row limit)
console.log('Fetching existing place_ids...');
const existingPlaceIds = new Set();
for (let offset = 0; offset < 40000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('google_place_id')
    .not('google_place_id', 'is', null)
    .range(offset, offset + 999);
  if (!data || data.length === 0) break;
  for (const r of data) if (r.google_place_id) existingPlaceIds.add(r.google_place_id);
  if (data.length < 1000) break;
}
console.log(`  ${existingPlaceIds.size} existing place_ids loaded`);

// Name heuristic — flag likely-touchless vs needs-manual-review
const TOUCHLESS_NAME_RE = /touch\s*(?:less|free)|touchfree|laser\s*wash|brushless|no\s*(?:-|\s)?touch|auto(?:matic)?\s*spa/i;

const rawResults = []; // { metro, query, results: [...] }
const candidateByPlaceId = new Map(); // dedup across all queries

let queriesRun = 0;
let errors = 0;
const startedAt = Date.now();

for (const metro of metros) {
  for (const q of QUERIES) {
    queriesRun++;
    const params = new URLSearchParams({
      engine: 'google_maps',
      q,
      ll: `@${metro.lat},${metro.lng},${ZOOM}z`,
      type: 'search',
      api_key: apiKey,
    });
    try {
      const res = await fetch(`https://serpapi.com/search.json?${params}`);
      if (!res.ok) { errors++; console.error(`  ERR ${metro.name} "${q}": HTTP ${res.status}`); continue; }
      const json = await res.json();
      const results = json.local_results || [];
      rawResults.push({ metro: metro.slug, query: q, count: results.length });

      for (const p of results) {
        if (!p.place_id) continue;
        if (existingPlaceIds.has(p.place_id)) continue;
        const nameMatch = TOUCHLESS_NAME_RE.test(p.title || '');
        const prior = candidateByPlaceId.get(p.place_id);
        if (prior) {
          // Already seen — add query/metro to the list
          prior.queriesMatched.add(q);
          prior.metrosMatched.add(metro.slug);
          if (nameMatch) prior.nameIsTouchless = true;
        } else {
          candidateByPlaceId.set(p.place_id, {
            place_id: p.place_id,
            name: p.title || '',
            address: p.address || '',
            lat: p.gps_coordinates?.latitude ?? null,
            lng: p.gps_coordinates?.longitude ?? null,
            rating: p.rating ?? null,
            reviews: p.reviews ?? null,
            phone: p.phone || '',
            types: (p.types || []).join('|'),
            open_state: p.open_state || '',
            thumbnail: p.thumbnail || '',
            queriesMatched: new Set([q]),
            metrosMatched: new Set([metro.slug]),
            nameIsTouchless: nameMatch,
            firstFoundMetro: metro.slug,
          });
        }
      }
    } catch (e) {
      errors++;
      console.error(`  ERR ${metro.name} "${q}":`, e.message);
    }
    // Progress every 20 queries
    if (queriesRun % 20 === 0) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      console.log(`  ${queriesRun}/${metros.length * QUERIES.length} queries · ${candidateByPlaceId.size} unique new candidates · ${elapsed}s elapsed · ${errors} errors`);
    }
  }
}

console.log(`\nDone. ${queriesRun} queries, ${errors} errors, ${candidateByPlaceId.size} unique new place_ids found`);

// Check account balance
const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${apiKey}`)).json();
console.log(`Credits remaining: ${acct.plan_searches_left ?? (acct.searches_per_month - (acct.searches_performed || 0))}`);

// Categorize + write CSV
const outDir = resolve(repoRoot, 'scripts/discovery-output');
mkdirSync(outDir, { recursive: true });

const candidates = Array.from(candidateByPlaceId.values()).map(c => ({
  ...c,
  queriesMatched: Array.from(c.queriesMatched).join('|'),
  metrosMatched: Array.from(c.metrosMatched).join('|'),
  metrosMatchedCount: c.metrosMatched.size,
}));

// Sort: name-matches-touchless first, then by reviews desc (most popular first)
candidates.sort((a, b) => {
  if (a.nameIsTouchless !== b.nameIsTouchless) return a.nameIsTouchless ? -1 : 1;
  return (b.reviews || 0) - (a.reviews || 0);
});

const csvEscape = (v) => {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
};
const cols = ['place_id','name','address','lat','lng','rating','reviews','phone','types','open_state','queriesMatched','metrosMatched','metrosMatchedCount','nameIsTouchless','firstFoundMetro','thumbnail'];
const csvLines = [cols.join(',')];
for (const c of candidates) {
  csvLines.push(cols.map(k => csvEscape(c[k])).join(','));
}
writeFileSync(resolve(outDir, 'serpapi-new-candidates.csv'), csvLines.join('\n'));
writeFileSync(resolve(outDir, 'serpapi-raw-results.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  queriesRun, errors,
  metros: metros.length,
  existingPlaceIds: existingPlaceIds.size,
  newCandidates: candidates.length,
  nameIsTouchlessCount: candidates.filter(c => c.nameIsTouchless).length,
  resultsByMetroQuery: rawResults,
}, null, 2));

console.log(`\nWrote: ${resolve(outDir, 'serpapi-new-candidates.csv')}`);
console.log(`       ${resolve(outDir, 'serpapi-raw-results.json')}`);
console.log(`\nBreakdown:`);
console.log(`  Total new candidates: ${candidates.length}`);
console.log(`  Name clearly signals touchless: ${candidates.filter(c => c.nameIsTouchless).length}`);
console.log(`  Needs manual review: ${candidates.filter(c => !c.nameIsTouchless).length}`);
console.log(`  Found in multiple metros: ${candidates.filter(c => c.metrosMatchedCount > 1).length}`);
console.log(`  With 100+ reviews: ${candidates.filter(c => (c.reviews || 0) >= 100).length}`);
