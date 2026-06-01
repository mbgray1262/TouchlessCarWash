#!/usr/bin/env node
/**
 * Medium-metro discovery sweep — same logic as small-metro-discovery but
 * targets metros with 20-50 approved touchless listings (suburban gap hunters).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const env = readFileSync(resolve(repoRoot, '.env.local'), 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...r] = l.split('='); if (k) a[k.trim()] = r.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const SERPAPI_KEY = env.SERPAPI_KEY;
const LOG = resolve(repoRoot, 'scripts/medium-metro-discovery.log');

function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(line); appendFileSync(LOG, line + '\n');
}

const TUNNEL_CHAIN_PATTERNS = [
  /tidal\s*wave/i, /whistle\s*express/i, /mister\s*car\s*wash/i, /quick\s*quack/i,
  /tommy.s\s*express/i, /take\s*5\s*car\s*wash/i, /zips\s*car\s*wash/i, /tsunami/i,
  /mr\s*clean\s*car\s*wash/i, /crew\s*carwash/i, /club\s*car\s*wash/i,
  /white\s*water\s*express/i, /rocket\s*car\s*wash/i, /soapy\s*joe/i,
  /modwash/i, /super\s*star\s*car\s*wash/i, /cobblestone/i, /bluebird\s*car\s*wash/i,
  /wash\s*depot/i, /spinx\s*express/i,
];
const isTunnelChain = (n) => TUNNEL_CHAIN_PATTERNS.some(p => p.test(n || ''));

async function serpMaps(query, ll) {
  const p = new URLSearchParams({ engine: 'google_maps', q: query, ll: `@${ll},12z`, type: 'search', api_key: SERPAPI_KEY });
  const res = await fetch(`https://serpapi.com/search.json?${p}`);
  return res.json();
}

function makeSlug(name, placeId) {
  const base = (name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const suffix = (placeId || '').slice(-6).toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${base}-${suffix}`;
}

async function pickTargetMetros() {
  const text = readFileSync(resolve(repoRoot, 'lib/metro-areas.ts'), 'utf8');
  const re = /\{\s*name:\s*'([^']+)',[^}]*?slug:\s*'([^']+)',\s*lat:\s*([-\d.]+),\s*lng:\s*([-\d.]+),\s*radiusMiles:\s*(\d+)[^}]*states:\s*\['([^']+)'\]/g;
  const metros = [];
  let m;
  while ((m = re.exec(text))) metros.push({ name: m[1], slug: m[2], lat: +m[3], lng: +m[4], radius: +m[5], state: m[6] });
  const { data: all } = await sb.from('listings').select('latitude,longitude')
    .eq('is_approved', true).eq('is_touchless', true).not('latitude', 'is', null);
  const counts = metros.map(metro => {
    const degLat = metro.radius / 69;
    const degLng = metro.radius / (69 * Math.cos(metro.lat * Math.PI / 180));
    let c = 0;
    for (const l of all ?? []) {
      if (Math.abs(l.latitude - metro.lat) <= degLat && Math.abs(l.longitude - metro.lng) <= degLng) c++;
    }
    return { ...metro, count: c };
  });
  return counts.filter(m => m.count >= 20 && m.count <= 50).sort((a, b) => a.count - b.count);
}

async function run() {
  writeFileSync(LOG, `=== medium-metro-discovery starting ${new Date().toISOString()} ===\n`);
  const metros = await pickTargetMetros();
  log(`Targeting ${metros.length} medium metros (20-50 listings each)`);
  const seen = new Set();
  for (let off = 0; off < 30000; off += 1000) {
    const { data } = await sb.from('listings').select('google_place_id').not('google_place_id', 'is', null).range(off, off + 999);
    if (!data?.length) break;
    for (const r of data) seen.add(r.google_place_id);
    if (data.length < 1000) break;
  }
  log(`Preloaded ${seen.size} existing place_ids`);
  let newL = 0, blocked = 0, dup = 0;
  const queries = ['touchless car wash', 'touch free car wash', 'laser car wash', 'brushless car wash'];
  for (let i = 0; i < metros.length; i++) {
    const metro = metros[i];
    // Only one query per metro to stay in budget — alternate across sweeps
    const q = queries[i % queries.length];
    log(`[${i+1}/${metros.length}] ${metro.name}, ${metro.state} (${metro.count} listings) — "${q}"`);
    try {
      const json = await serpMaps(`${q} ${metro.name} ${metro.state}`, `${metro.lat},${metro.lng}`);
      const places = json.local_results ?? [];
      let added = 0;
      for (const p of places) {
        const pid = p.place_id || p.data_id;
        if (!pid || seen.has(pid)) { if (pid) dup++; continue; }
        if (isTunnelChain(p.title)) { blocked++; continue; }
        seen.add(pid);
        const zipMatch = (p.address || '').match(/\b(\d{5})(?:-\d{4})?\b\s*$/);
        const zip = zipMatch ? zipMatch[1] : '00000';
        const { error } = await sb.from('listings').insert({
          name: p.title, slug: makeSlug(p.title, pid), address: p.address, city: metro.name, state: metro.state, zip,
          google_place_id: pid, latitude: p.gps_coordinates?.latitude, longitude: p.gps_coordinates?.longitude,
          phone: p.phone, website: p.website, rating: p.rating, review_count: p.reviews, google_category: p.type,
          is_touchless: null, is_approved: false,
          crawl_notes: `[auto ${new Date().toISOString().slice(0, 10)}] Discovered via SerpAPI google_maps (medium-metro sweep, query="${q}") in ${metro.name}, ${metro.state}`,
        });
        if (error) { log(`  insert fail "${p.title}": ${error.message}`); continue; }
        newL++; added++;
      }
      log(`    ${places.length} results, +${added} new`);
    } catch (e) { log(`    ERROR: ${e.message}`); }
    await new Promise(r => setTimeout(r, 1200));
  }
  log(`=== DONE === Metros: ${metros.length}, new: ${newL}, dup: ${dup}, blocked: ${blocked}`);
}

run().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
