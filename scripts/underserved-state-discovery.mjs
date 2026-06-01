#!/usr/bin/env node
/**
 * Underserved-state sweep — state-level SerpAPI Google Maps search for states
 * with <50 approved touchless listings. Finds popular touchless washes that
 * metro-centric sweeps miss (e.g., rural-state listings outside our metros).
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
const LOG = resolve(repoRoot, 'scripts/underserved-state-discovery.log');

function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(line); appendFileSync(LOG, line + '\n');
}

const STATE_FULL = {
  AK: 'Alaska', AL: 'Alabama', AR: 'Arkansas', AZ: 'Arizona', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DC: 'District of Columbia', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', IA: 'Iowa', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', MA: 'Massachusetts', MD: 'Maryland', ME: 'Maine', MI: 'Michigan', MN: 'Minnesota',
  MO: 'Missouri', MS: 'Mississippi', MT: 'Montana', NC: 'North Carolina', ND: 'North Dakota',
  NE: 'Nebraska', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NV: 'Nevada',
  NY: 'New York', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VA: 'Virginia',
  VT: 'Vermont', WA: 'Washington', WI: 'Wisconsin', WV: 'West Virginia', WY: 'Wyoming',
};

const TUNNEL_CHAIN_PATTERNS = [
  /tidal\s*wave/i, /whistle\s*express/i, /mister\s*car\s*wash/i, /quick\s*quack/i,
  /tommy.s\s*express/i, /take\s*5\s*car\s*wash/i, /zips\s*car\s*wash/i, /tsunami/i,
  /mr\s*clean\s*car\s*wash/i, /crew\s*carwash/i, /club\s*car\s*wash/i,
  /white\s*water\s*express/i, /rocket\s*car\s*wash/i, /soapy\s*joe/i,
  /modwash/i, /super\s*star\s*car\s*wash/i, /cobblestone/i, /bluebird\s*car\s*wash/i,
  /wash\s*depot/i,
];
const isTunnelChain = (n) => TUNNEL_CHAIN_PATTERNS.some(p => p.test(n || ''));

async function serpMaps(query) {
  // no ll — let SerpAPI match by state name in query
  const p = new URLSearchParams({ engine: 'google_maps', q: query, type: 'search', api_key: SERPAPI_KEY });
  const res = await fetch(`https://serpapi.com/search.json?${p}`);
  return res.json();
}

function makeSlug(name, pid) {
  const base = (name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${base}-${(pid || '').slice(-6).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

async function run() {
  writeFileSync(LOG, `=== underserved-state-discovery starting ${new Date().toISOString()} ===\n`);
  // Count approved touchless per state
  const counts = {};
  for (let off = 0; off < 10000; off += 1000) {
    const { data } = await sb.from('listings').select('state').eq('is_approved', true).eq('is_touchless', true).range(off, off + 999);
    if (!data?.length) break;
    for (const r of data) counts[r.state] = (counts[r.state] ?? 0) + 1;
    if (data.length < 1000) break;
  }
  const underserved = Object.keys(STATE_FULL).filter(s => (counts[s] ?? 0) < 50).sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0));
  log(`Underserved states (<50 approved touchless): ${underserved.length}`);
  for (const s of underserved) log(`  ${s} (${STATE_FULL[s]}): ${counts[s] ?? 0} listings`);

  // Preload place_ids
  const seen = new Set();
  for (let off = 0; off < 30000; off += 1000) {
    const { data } = await sb.from('listings').select('google_place_id').not('google_place_id', 'is', null).range(off, off + 999);
    if (!data?.length) break;
    for (const r of data) seen.add(r.google_place_id);
    if (data.length < 1000) break;
  }
  log(`Preloaded ${seen.size} existing place_ids`);

  let newL = 0, blocked = 0;
  for (let i = 0; i < underserved.length; i++) {
    const s = underserved[i];
    const query = `touchless car wash ${STATE_FULL[s]}`;
    log(`[${i+1}/${underserved.length}] ${STATE_FULL[s]} — searching...`);
    try {
      const json = await serpMaps(query);
      const places = json.local_results ?? [];
      let added = 0;
      for (const p of places) {
        const pid = p.place_id || p.data_id;
        if (!pid || seen.has(pid)) continue;
        if (isTunnelChain(p.title)) { blocked++; continue; }
        seen.add(pid);
        const zipMatch = (p.address || '').match(/\b(\d{5})(?:-\d{4})?\b\s*$/);
        const zip = zipMatch ? zipMatch[1] : '00000';
        // Try to extract city from address "Street, City, ST ZIP"
        const cityMatch = (p.address || '').match(/,\s*([^,]+),\s*[A-Z]{2}\s*\d{5}/);
        const city = cityMatch ? cityMatch[1].trim() : STATE_FULL[s];
        const { error } = await sb.from('listings').insert({
          name: p.title, slug: makeSlug(p.title, pid), address: p.address, city, state: s, zip,
          google_place_id: pid, latitude: p.gps_coordinates?.latitude, longitude: p.gps_coordinates?.longitude,
          phone: p.phone, website: p.website, rating: p.rating, review_count: p.reviews, google_category: p.type,
          is_touchless: null, is_approved: false,
          crawl_notes: `[auto ${new Date().toISOString().slice(0, 10)}] Discovered via SerpAPI state sweep (${STATE_FULL[s]})`,
        });
        if (error) { log(`  insert fail "${p.title}": ${error.message}`); continue; }
        newL++; added++;
      }
      log(`    ${places.length} results, +${added} new`);
    } catch (e) { log(`    ERROR: ${e.message}`); }
    await new Promise(r => setTimeout(r, 1200));
  }
  log(`=== DONE === States: ${underserved.length}, new: ${newL}, blocked: ${blocked}`);
}

run().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
