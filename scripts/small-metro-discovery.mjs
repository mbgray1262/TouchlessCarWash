#!/usr/bin/env node
/**
 * Small-metro discovery sweep — uses SerpAPI `google_maps` engine to find
 * touchless car wash candidates in metros that currently have 3-20 approved
 * listings (the expandable range). Inserts new place_ids as listings with
 * is_touchless=null so they flow through the regular classification pipeline.
 *
 * Budget: ~50 metros × 1 credit = 50 credits of 4000 available.
 * Each search returns up to 20 places. Typical yield: 2-5 new listings per
 * metro (many will already be in DB).
 *
 * Safe to re-run: dedupes by google_place_id before insert.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = resolve(repoRoot, '.env.local');
const env = readFileSync(envPath, 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...r] = l.split('='); if (k) a[k.trim()] = r.join('=').trim(); return a; }, {});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERPAPI_KEY = env.SERPAPI_KEY;
if (!SERPAPI_KEY) { console.error('Missing SERPAPI_KEY in .env.local'); process.exit(1); }

const sb = createClient(SUPABASE_URL, ANON);
const LOG = resolve(repoRoot, 'scripts/small-metro-discovery.log');
function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

// Tunnel chain / non-touchless blocklist (reject at discovery time so we don't
// bloat the DB with known-bad brands the verifier would just re-revert)
const TUNNEL_CHAIN_PATTERNS = [
  /tidal\s*wave/i, /whistle\s*express/i, /mister\s*car\s*wash/i, /quick\s*quack/i,
  /tommy.s\s*express/i, /take\s*5\s*car\s*wash/i, /zips\s*car\s*wash/i, /tsunami/i,
  /mr\s*clean\s*car\s*wash/i, /crew\s*carwash/i, /club\s*car\s*wash/i,
  /white\s*water\s*express/i, /rocket\s*car\s*wash/i, /soapy\s*joe/i,
  /modwash/i, /super\s*star\s*car\s*wash/i, /cobblestone/i, /bluebird\s*car\s*wash/i,
  /wash\s*depot/i, /spinx\s*express/i,
];
const isTunnelChain = (name) => TUNNEL_CHAIN_PATTERNS.some(p => p.test(name));

async function serpMaps(query, location) {
  const p = new URLSearchParams({
    engine: 'google_maps',
    q: query,
    ll: location ? `@${location},12z` : '',
    type: 'search',
    api_key: SERPAPI_KEY,
  });
  const res = await fetch(`https://serpapi.com/search.json?${p}`);
  const json = await res.json();
  return json;
}

// Metro list from METRO_AREAS (parsed from lib/metro-areas.ts).
// We want metros with 3-20 approved touchless listings — the "expandable" range.
async function pickTargetMetros() {
  const text = readFileSync(resolve(repoRoot, 'lib/metro-areas.ts'), 'utf8');
  const re = /\{\s*name:\s*'([^']+)',[^}]*?slug:\s*'([^']+)',\s*lat:\s*([-\d.]+),\s*lng:\s*([-\d.]+),\s*radiusMiles:\s*(\d+)[^}]*states:\s*\['([^']+)'\]/g;
  const metros = [];
  let m;
  while ((m = re.exec(text))) metros.push({ name: m[1], slug: m[2], lat: +m[3], lng: +m[4], radius: +m[5], state: m[6] });

  // For each: count approved touchless within bounding box (quick, not exact haversine)
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
  const small = counts.filter(m => m.count >= 3 && m.count <= 20).sort((a, b) => a.count - b.count);
  return small;
}

async function run() {
  writeFileSync(LOG, `=== small-metro-discovery starting ${new Date().toISOString()} ===\n`);
  const metros = await pickTargetMetros();
  log(`Targeting ${metros.length} small metros (3-20 approved touchless listings each)`);

  let totalFound = 0, newListings = 0, blocked = 0, alreadyExists = 0;
  const seenPlaceIds = new Set();
  // Preload all existing place_ids so we can dedupe cheaply.
  // PostgREST caps at 1000 rows per page, so paginate.
  {
    for (let off = 0; off < 30000; off += 1000) {
      const { data } = await sb.from('listings').select('google_place_id')
        .not('google_place_id', 'is', null).range(off, off + 999);
      if (!data || data.length === 0) break;
      for (const r of data) seenPlaceIds.add(r.google_place_id);
      if (data.length < 1000) break;
    }
    log(`Preloaded ${seenPlaceIds.size} existing place_ids for dedup`);
  }

  // Slug builder: name + last 4 of place_id for uniqueness
  function makeSlug(name, placeId) {
    const base = (name || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const suffix = (placeId || '').slice(-6).toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${base}-${suffix}`;
  }

  for (let i = 0; i < metros.length; i++) {
    const metro = metros[i];
    const query = `touchless car wash ${metro.name} ${metro.state}`;
    log(`[${i + 1}/${metros.length}] ${metro.name}, ${metro.state} (currently ${metro.count} listings) — searching...`);
    try {
      const json = await serpMaps(query, `${metro.lat},${metro.lng}`);
      const places = json.local_results ?? [];
      totalFound += places.length;
      let addedThisMetro = 0;
      for (const p of places) {
        const pid = p.place_id || p.data_id;
        if (!pid) continue;
        if (seenPlaceIds.has(pid)) { alreadyExists++; continue; }
        if (isTunnelChain(p.title || '')) { blocked++; continue; }
        seenPlaceIds.add(pid);

        // Parse zip from address if present (US format: "..., ST 12345")
        const zipMatch = (p.address || '').match(/\b(\d{5})(?:-\d{4})?\b\s*$/);
        const zip = zipMatch ? zipMatch[1] : '00000'; // placeholder if address has no zip

        // Insert skeleton listing. is_touchless=null so it flows through classifier.
        const insertRow = {
          name: p.title,
          slug: makeSlug(p.title, pid),
          address: p.address,
          city: metro.name,
          state: metro.state,
          zip,
          google_place_id: pid,
          latitude: p.gps_coordinates?.latitude,
          longitude: p.gps_coordinates?.longitude,
          phone: p.phone,
          website: p.website,
          rating: p.rating,
          review_count: p.reviews,
          google_category: p.type,
          is_touchless: null,
          is_approved: false,
          crawl_notes: `[auto ${new Date().toISOString().slice(0, 10)}] Discovered via SerpAPI google_maps search in ${metro.name}, ${metro.state}`,
        };
        const { error } = await sb.from('listings').insert(insertRow);
        if (error) {
          log(`  ⚠  insert failed for "${p.title}": ${error.message}`);
          continue;
        }
        newListings++;
        addedThisMetro++;
      }
      log(`    found ${places.length} results, added ${addedThisMetro} new (${alreadyExists} already in DB, ${blocked} tunnel-chain blocked)`);
    } catch (e) {
      log(`    ERROR: ${e.message}`);
    }
    // Rate limit: SerpAPI has generous limits but be polite
    await new Promise(r => setTimeout(r, 1200));
  }

  log(`=== DONE ===`);
  log(`Metros searched: ${metros.length}`);
  log(`Total SerpAPI credits used: ${metros.length}`);
  log(`Total results returned: ${totalFound}`);
  log(`New listings added: ${newListings}`);
  log(`Already in DB (dedup): ${alreadyExists}`);
  log(`Tunnel-chain blocked: ${blocked}`);
  log(`Next step: run review-mine scan_batch on the new listings to classify touchless/not`);
}

run().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
