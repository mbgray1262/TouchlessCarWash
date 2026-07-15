/**
 * Populate scripts/_maps_photos_cache.json from the AUTHORITATIVE Google Places API —
 * the reliable replacement for the retired maps-photos-scrape.py (which leaked nearby
 * businesses' photos; see memory project_scraper_photo_contamination). Photos come from
 * the `google-place-photos` edge fn (GET, size=1600), scoped server-side to the exact
 * place_id, so a listing can NEVER get a neighbour's photo. autophoto then reads the cache
 * exactly as before (its downloadUrl/hiResBuffer now fetch these pre-sized URLs as-is).
 *
 * Per-state workflow (replaces the scrape step):
 *   node scripts/selfserve-places-fetch.mjs AZ           # fill cache for pending AZ listings
 *   node scripts/selfserve-places-fetch.mjs AZ --force    # re-fetch even if cached
 *   node scripts/selfserve-autophoto.mjs AZ 200 --apply   # then art-direct as usual
 *   node scripts/selfserve-descriptions.mjs --prep --state AZ --run
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(SB_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const STATE = (process.argv[2] || 'AZ').toUpperCase();
const FORCE = process.argv.includes('--force');
const CACHE = 'scripts/_maps_photos_cache.json';
const LIMIT_PHOTOS = 10; // authoritative sets are small; 10 is plenty for hero + gallery
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Authoritative photos for a place_id at 1600px, with retry (Places API can rate-limit).
async function placesPhotos(pid) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`${SB_URL}/functions/v1/google-place-photos?place_id=${pid}&offset=0&limit=${LIMIT_PHOTOS}&size=1600`,
        { headers: { Authorization: `Bearer ${ANON}` }, signal: AbortSignal.timeout(25000) });
      if (r.ok) { const j = await r.json(); return (j.photos || []).map((p) => p.url).filter(Boolean); }
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (a + 1)); continue; }
      return []; // 4xx (e.g. no photos) — nothing to retry
    } catch { await sleep(1500 * (a + 1)); }
  }
  return [];
}

// Pending listings for this state (mirror maps-photos-scrape.py's scope).
let rows = [], page = 0;
while (true) {
  const { data } = await sb.from('listings')
    .select('name, google_place_id')
    .eq('is_self_service', true).is('self_service_reviewed_at', null)
    .eq('state', STATE).not('google_place_id', 'is', null)
    .order('id').range(page * 1000, page * 1000 + 999);
  if (!data || !data.length) break; rows.push(...data); if (data.length < 1000) break; page++;
}
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const todo = rows.filter((r) => FORCE || !(r.google_place_id in cache));
console.log(`${STATE}: ${rows.length} pending listings, ${todo.length} to fetch (${rows.length - todo.length} already cached).`);

let done = 0, empty = 0;
for (let i = 0; i < todo.length; i++) {
  const r = todo[i];
  const urls = await placesPhotos(r.google_place_id);
  cache[r.google_place_id] = urls;
  if (urls.length) done++; else empty++;
  if (done % 10 === 0 || i < 5) console.log(`  [${i + 1}/${todo.length}] ${r.name.slice(0, 34)}: ${urls.length} photos`);
  if ((i + 1) % 15 === 0) writeFileSync(CACHE, JSON.stringify(cache)); // persist incrementally
  await sleep(250); // gentle pacing
}
writeFileSync(CACHE, JSON.stringify(cache));
const counts = todo.map((r) => (cache[r.google_place_id] || []).length);
const nz = counts.filter((c) => c);
console.log(`\nDONE ${STATE}: ${done} got photos (avg ${nz.length ? Math.round(nz.reduce((a, b) => a + b, 0) / nz.length) : 0}, max ${counts.length ? Math.max(...counts) : 0}) | ${empty} got 0. Cache: ${CACHE} (authoritative Places API)`);
