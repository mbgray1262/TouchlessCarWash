#!/usr/bin/env node
/**
 * Retries the (metro, query) pairs that got HTTP 429 in the first sweep,
 * with a 1200ms delay between requests. Reads the existing candidates CSV,
 * determines which pairs are missing from serpapi-raw-results.json, and
 * only runs those. Merges new results into the existing CSV.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = [resolve(repoRoot, '.env.local'), '/Users/michaelgray/Projects/TouchlessCarWash/.env.local']
  .find(p => { try { readFileSync(p, 'utf8'); return true; } catch { return false; } });
const env = readFileSync(envPath, 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...r] = l.split('='); if (k) a[k.trim()] = r.join('=').trim(); return a; }, {});
const apiKey = env.SERPAPI_KEY;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Parse METRO_AREAS again
const metroFile = readFileSync(resolve(repoRoot, 'lib/metro-areas.ts'), 'utf8');
const metros = [];
const entryRe = /\{\s*name:\s*'([^']+)',\s*displayName:\s*'([^']+)',\s*slug:\s*'([^']+)',\s*lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+),/g;
let m;
while ((m = entryRe.exec(metroFile)) !== null) {
  metros.push({ name: m[1], slug: m[3], lat: parseFloat(m[4]), lng: parseFloat(m[5]) });
}

const QUERIES = ['touchless car wash', 'laser car wash', 'brushless car wash'];
const raw = JSON.parse(readFileSync(resolve(repoRoot, 'scripts/discovery-output/serpapi-raw-results.json'), 'utf8'));
const completedPairs = new Set(raw.resultsByMetroQuery.map(r => `${r.metro}|${r.query}`));

// Find missing (metro, query) pairs
const missing = [];
for (const metro of metros) {
  for (const q of QUERIES) {
    const key = `${metro.slug}|${q}`;
    if (!completedPairs.has(key)) missing.push({ metro, q });
  }
}
console.log(`Missing pairs to retry: ${missing.length}`);

// Load existing place_ids
const existingPlaceIds = new Set();
for (let offset = 0; offset < 40000; offset += 1000) {
  const { data } = await sb.from('listings').select('google_place_id').not('google_place_id','is',null).range(offset, offset+999);
  if (!data || data.length === 0) break;
  for (const r of data) if (r.google_place_id) existingPlaceIds.add(r.google_place_id);
  if (data.length < 1000) break;
}

// Load existing candidates from CSV (so we preserve them)
const existingCsv = readFileSync(resolve(repoRoot, 'scripts/discovery-output/serpapi-new-candidates.csv'), 'utf8');
const csvLines = existingCsv.split('\n');
const headers = csvLines[0].split(',');
const candidateByPlaceId = new Map();

function parseCsvLine(line) {
  const cells = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { cells.push(cur); cur = ''; }
      else cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

for (let i = 1; i < csvLines.length; i++) {
  if (!csvLines[i].trim()) continue;
  const cells = parseCsvLine(csvLines[i]);
  const obj = {};
  headers.forEach((h, idx) => obj[h] = cells[idx]);
  obj.queriesMatched = new Set((obj.queriesMatched || '').split('|').filter(Boolean));
  obj.metrosMatched = new Set((obj.metrosMatched || '').split('|').filter(Boolean));
  obj.nameIsTouchless = obj.nameIsTouchless === 'true';
  obj.reviews = obj.reviews ? parseInt(obj.reviews, 10) : null;
  obj.rating = obj.rating ? parseFloat(obj.rating) : null;
  candidateByPlaceId.set(obj.place_id, obj);
}
console.log(`Loaded ${candidateByPlaceId.size} existing candidates from CSV`);

const TOUCHLESS_NAME_RE = /touch\s*(?:less|free)|touchfree|laser\s*wash|brushless|no\s*(?:-|\s)?touch|auto(?:matic)?\s*spa/i;
const ZOOM = 12;
const DELAY_MS = 1200;

let errors = 0, newThisRun = 0;
const newRawEntries = [];

for (let i = 0; i < missing.length; i++) {
  const { metro, q } = missing[i];
  const params = new URLSearchParams({
    engine: 'google_maps',
    q,
    ll: `@${metro.lat},${metro.lng},${ZOOM}z`,
    type: 'search',
    api_key: apiKey,
  });
  try {
    const res = await fetch(`https://serpapi.com/search.json?${params}`);
    if (!res.ok) {
      if (res.status === 429) {
        console.error(`  429 on ${metro.name}/${q} — sleeping 5s`);
        await new Promise(r => setTimeout(r, 5000));
        i--; // retry this one
        continue;
      }
      errors++; console.error(`  HTTP ${res.status} on ${metro.name}/${q}`);
      continue;
    }
    const json = await res.json();
    const results = json.local_results || [];
    newRawEntries.push({ metro: metro.slug, query: q, count: results.length });
    for (const p of results) {
      if (!p.place_id || existingPlaceIds.has(p.place_id)) continue;
      const nameMatch = TOUCHLESS_NAME_RE.test(p.title || '');
      const prior = candidateByPlaceId.get(p.place_id);
      if (prior) {
        prior.queriesMatched.add(q);
        prior.metrosMatched.add(metro.slug);
        if (nameMatch) prior.nameIsTouchless = true;
      } else {
        newThisRun++;
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
    console.error(`  ERR ${metro.name}/${q}:`, e.message);
  }
  if ((i+1) % 20 === 0) console.log(`  ${i+1}/${missing.length} retried · ${newThisRun} net-new candidates so far`);
  await new Promise(r => setTimeout(r, DELAY_MS));
}

const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${apiKey}`)).json();
console.log(`\nRetry done. Net-new candidates: ${newThisRun}. Errors: ${errors}. Credits remaining: ${acct.plan_searches_left}`);

// Rewrite CSV
const candidates = Array.from(candidateByPlaceId.values()).map(c => ({
  ...c,
  queriesMatched: Array.from(c.queriesMatched).join('|'),
  metrosMatched: Array.from(c.metrosMatched).join('|'),
  metrosMatchedCount: c.metrosMatched.size || Array.from(c.metrosMatched).length,
}));
candidates.sort((a, b) => {
  if (a.nameIsTouchless !== b.nameIsTouchless) return a.nameIsTouchless ? -1 : 1;
  return (b.reviews || 0) - (a.reviews || 0);
});

const csvEscape = (v) => { if (v == null) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const cols = ['place_id','name','address','lat','lng','rating','reviews','phone','types','open_state','queriesMatched','metrosMatched','metrosMatchedCount','nameIsTouchless','firstFoundMetro','thumbnail'];
const out = [cols.join(',')];
for (const c of candidates) out.push(cols.map(k => csvEscape(c[k])).join(','));
writeFileSync(resolve(repoRoot, 'scripts/discovery-output/serpapi-new-candidates.csv'), out.join('\n'));

// Merge raw results
raw.resultsByMetroQuery.push(...newRawEntries);
raw.newCandidates = candidates.length;
raw.nameIsTouchlessCount = candidates.filter(c => c.nameIsTouchless).length;
raw.retryRunAt = new Date().toISOString();
writeFileSync(resolve(repoRoot, 'scripts/discovery-output/serpapi-raw-results.json'), JSON.stringify(raw, null, 2));

console.log(`\nFinal totals:`);
console.log(`  Unique new candidates: ${candidates.length}`);
console.log(`  Name clearly touchless: ${candidates.filter(c => c.nameIsTouchless).length}`);
console.log(`  100+ reviews: ${candidates.filter(c => (c.reviews || 0) >= 100).length}`);
console.log(`  500+ reviews: ${candidates.filter(c => (c.reviews || 0) >= 500).length}`);
console.log(`  1000+ reviews: ${candidates.filter(c => (c.reviews || 0) >= 1000).length}`);
