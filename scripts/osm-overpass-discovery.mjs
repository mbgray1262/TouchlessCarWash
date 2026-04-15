#!/usr/bin/env node
/**
 * OpenStreetMap Overpass API discovery sweep.
 *
 * Queries ALL 50 US states (via bounding boxes) for amenity=car_wash,
 * extracts touchless signals (car_wash=touchless tag, "touch"/"laser" in name,
 * automated=yes), coordinate-matches against existing DB listings, and writes
 * a CSV of candidates we don't have yet.
 *
 * 100% free — uses OSM Overpass API public servers.
 *
 * Per memory notes (Delaware test): 78 car washes found, 44 matched our DB,
 * 34 were completely missing. Full US sweep expected to surface 1,000-3,000
 * missing listings.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = [resolve(repoRoot, '.env.local'), '/Users/michaelgray/Projects/TouchlessCarWash/.env.local']
  .find(p => { try { readFileSync(p,'utf8'); return true; } catch { return false; } });
const env = readFileSync(envPath,'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// US state bounding boxes [minLat, minLng, maxLat, maxLng]
// Source: US Census/NOAA approximate bounds, large states split to avoid timeouts
const STATE_BBOXES = [
  { code: 'AL', name: 'Alabama', bbox: [30.14, -88.47, 35.01, -84.89] },
  { code: 'AK', name: 'Alaska', bbox: [51.20, -179.15, 71.54, -129.97] },
  { code: 'AZ', name: 'Arizona', bbox: [31.33, -114.82, 37.00, -109.04] },
  { code: 'AR', name: 'Arkansas', bbox: [33.00, -94.62, 36.50, -89.64] },
  { code: 'CA-N', name: 'California North', bbox: [36.00, -124.48, 42.01, -119.00] },
  { code: 'CA-S', name: 'California South', bbox: [32.53, -124.41, 36.01, -114.13] },
  { code: 'CO', name: 'Colorado', bbox: [36.99, -109.06, 41.00, -102.04] },
  { code: 'CT', name: 'Connecticut', bbox: [40.98, -73.73, 42.05, -71.78] },
  { code: 'DE', name: 'Delaware', bbox: [38.45, -75.79, 39.84, -75.05] },
  { code: 'FL-N', name: 'Florida North', bbox: [28.50, -87.63, 31.00, -79.97] },
  { code: 'FL-S', name: 'Florida South', bbox: [24.52, -82.92, 28.51, -79.97] },
  { code: 'GA', name: 'Georgia', bbox: [30.36, -85.61, 35.00, -80.75] },
  { code: 'HI', name: 'Hawaii', bbox: [18.91, -160.25, 22.24, -154.80] },
  { code: 'ID', name: 'Idaho', bbox: [41.99, -117.24, 49.00, -111.04] },
  { code: 'IL', name: 'Illinois', bbox: [36.97, -91.51, 42.51, -87.02] },
  { code: 'IN', name: 'Indiana', bbox: [37.77, -88.10, 41.76, -84.78] },
  { code: 'IA', name: 'Iowa', bbox: [40.38, -96.64, 43.50, -90.14] },
  { code: 'KS', name: 'Kansas', bbox: [36.99, -102.05, 40.00, -94.59] },
  { code: 'KY', name: 'Kentucky', bbox: [36.50, -89.57, 39.15, -81.97] },
  { code: 'LA', name: 'Louisiana', bbox: [28.93, -94.04, 33.02, -88.82] },
  { code: 'ME', name: 'Maine', bbox: [43.06, -71.08, 47.46, -66.95] },
  { code: 'MD', name: 'Maryland', bbox: [37.89, -79.49, 39.72, -75.05] },
  { code: 'MA', name: 'Massachusetts', bbox: [41.24, -73.51, 42.89, -69.93] },
  { code: 'MI', name: 'Michigan', bbox: [41.70, -90.42, 48.30, -82.12] },
  { code: 'MN', name: 'Minnesota', bbox: [43.50, -97.24, 49.38, -89.49] },
  { code: 'MS', name: 'Mississippi', bbox: [30.17, -91.66, 34.99, -88.10] },
  { code: 'MO', name: 'Missouri', bbox: [35.99, -95.77, 40.61, -89.10] },
  { code: 'MT', name: 'Montana', bbox: [44.36, -116.05, 49.00, -104.04] },
  { code: 'NE', name: 'Nebraska', bbox: [39.99, -104.05, 43.00, -95.31] },
  { code: 'NV', name: 'Nevada', bbox: [35.00, -120.00, 42.00, -114.04] },
  { code: 'NH', name: 'New Hampshire', bbox: [42.70, -72.56, 45.31, -70.61] },
  { code: 'NJ', name: 'New Jersey', bbox: [38.92, -75.56, 41.36, -73.89] },
  { code: 'NM', name: 'New Mexico', bbox: [31.33, -109.05, 37.00, -103.00] },
  { code: 'NY-U', name: 'New York Upstate', bbox: [41.70, -79.76, 45.02, -73.44] },
  { code: 'NY-NYC', name: 'NYC Metro', bbox: [40.50, -74.26, 41.70, -73.44] },
  { code: 'NC', name: 'North Carolina', bbox: [33.84, -84.32, 36.59, -75.46] },
  { code: 'ND', name: 'North Dakota', bbox: [45.94, -104.05, 49.00, -96.55] },
  { code: 'OH', name: 'Ohio', bbox: [38.40, -84.82, 42.32, -80.52] },
  { code: 'OK', name: 'Oklahoma', bbox: [33.62, -103.00, 37.00, -94.43] },
  { code: 'OR', name: 'Oregon', bbox: [41.99, -124.57, 46.29, -116.46] },
  { code: 'PA-E', name: 'Pennsylvania East', bbox: [39.72, -78.00, 42.27, -74.69] },
  { code: 'PA-W', name: 'Pennsylvania West', bbox: [39.72, -80.52, 42.27, -78.00] },
  { code: 'RI', name: 'Rhode Island', bbox: [41.15, -71.86, 42.02, -71.12] },
  { code: 'SC', name: 'South Carolina', bbox: [32.03, -83.36, 35.22, -78.54] },
  { code: 'SD', name: 'South Dakota', bbox: [42.48, -104.06, 45.95, -96.44] },
  { code: 'TN', name: 'Tennessee', bbox: [34.98, -90.31, 36.68, -81.65] },
  { code: 'TX-E', name: 'Texas East', bbox: [25.84, -100.00, 36.50, -93.51] },
  { code: 'TX-W', name: 'Texas West', bbox: [25.84, -106.65, 36.50, -100.00] },
  { code: 'UT', name: 'Utah', bbox: [36.99, -114.05, 42.00, -109.04] },
  { code: 'VT', name: 'Vermont', bbox: [42.73, -73.44, 45.02, -71.46] },
  { code: 'VA', name: 'Virginia', bbox: [36.54, -83.68, 39.47, -75.24] },
  { code: 'WA', name: 'Washington', bbox: [45.54, -124.85, 49.00, -116.92] },
  { code: 'WV', name: 'West Virginia', bbox: [37.20, -82.64, 40.64, -77.72] },
  { code: 'WI', name: 'Wisconsin', bbox: [42.49, -92.89, 47.08, -86.25] },
  { code: 'WY', name: 'Wyoming', bbox: [40.99, -111.06, 45.01, -104.05] },
  { code: 'DC', name: 'Washington DC', bbox: [38.79, -77.12, 38.99, -76.91] },
];

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];
let endpointIdx = 0;

const TOUCHLESS_NAME_RE = /touch\s*(?:less|free)|touchfree|touchless|no[\s-]touch|laser\s*wash|laserwash|brushless/i;

function osmSignalsTouchless(tags) {
  if (!tags) return false;
  if (tags.car_wash === 'touchless') return true;
  if (tags['car_wash:touchless'] === 'yes') return true;
  if (tags.touchless === 'yes') return true;
  if (TOUCHLESS_NAME_RE.test(tags.name || '')) return true;
  return false;
}

async function queryState(bbox, state) {
  const [minLat, minLng, maxLat, maxLng] = bbox;
  const query = `[out:json][timeout:90];
(
  node["amenity"="car_wash"](${minLat},${minLng},${maxLat},${maxLng});
  way["amenity"="car_wash"](${minLat},${minLng},${maxLat},${maxLng});
);
out tags center;`;

  // Try endpoints with rotation on failure
  for (let attempt = 0; attempt < 3; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[endpointIdx % OVERPASS_ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: query,
      });
      if (!res.ok) {
        if (res.status === 429 || res.status === 504) {
          endpointIdx++;
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      return json.elements || [];
    } catch (e) {
      console.error(`  ! ${state} attempt ${attempt+1} on ${endpoint.replace('https://','').slice(0,25)}: ${e.message.slice(0,80)}`);
      endpointIdx++;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return null;
}

// ── Haversine ──
function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Load existing listing coordinates ──
console.log('Loading existing listing coordinates...');
const existing = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('id, latitude, longitude')
    .not('latitude','is',null)
    .not('longitude','is',null)
    .range(offset, offset + 999);
  if (!data || data.length === 0) break;
  for (const r of data) existing.push({ id: r.id, lat: r.latitude, lng: r.longitude });
  if (data.length < 1000) break;
}
console.log(`  ${existing.length} existing listings with coordinates`);

// Spatial index: bucket by ~10-mile cells for fast coord matching
const CELL_SIZE = 0.15; // ~10 miles
const cellMap = new Map();
function cellKey(lat, lng) { return `${Math.floor(lat / CELL_SIZE)}_${Math.floor(lng / CELL_SIZE)}`; }
for (const e of existing) {
  const k = cellKey(e.lat, e.lng);
  if (!cellMap.has(k)) cellMap.set(k, []);
  cellMap.get(k).push(e);
}
function nearestExisting(lat, lng, maxMiles = 0.1) {
  // 0.1 miles = ~150m
  const cellLat = Math.floor(lat / CELL_SIZE);
  const cellLng = Math.floor(lng / CELL_SIZE);
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      const bucket = cellMap.get(`${cellLat+dLat}_${cellLng+dLng}`);
      if (!bucket) continue;
      for (const e of bucket) {
        if (haversineMiles(lat, lng, e.lat, e.lng) <= maxMiles) return e;
      }
    }
  }
  return null;
}

// ── Sweep ──
const outDir = resolve(repoRoot, 'scripts/discovery-output');
mkdirSync(outDir, { recursive: true });

const missing = [];
const touchlessMissing = [];
let totalFound = 0, totalMatched = 0;
const byStateStats = [];

console.log('\nSweeping OSM states...');
for (const s of STATE_BBOXES) {
  process.stdout.write(`  ${s.code.padEnd(8)} ${s.name.padEnd(24)}`);
  const elements = await queryState(s.bbox, s.code);
  if (elements === null) {
    console.log(`  FAILED`);
    byStateStats.push({ state: s.code, found: 0, matched: 0, missing: 0, touchless: 0, error: true });
    continue;
  }
  let stateMissing = 0, stateTouchless = 0;
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!lat || !lng) continue;
    const tags = el.tags || {};
    const match = nearestExisting(lat, lng, 0.1);
    if (match) {
      totalMatched++;
      continue;
    }
    const isTouchlessSignal = osmSignalsTouchless(tags);
    const row = {
      osm_id: `${el.type}/${el.id}`,
      name: tags.name || '',
      brand: tags.brand || '',
      lat, lng,
      state: s.code.split('-')[0],
      car_wash_type: tags.car_wash || '',
      automated: tags.automated || '',
      self_service: tags.self_service || '',
      address: [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
      city: tags['addr:city'] || '',
      zip: tags['addr:postcode'] || '',
      phone: tags.phone || tags['contact:phone'] || '',
      website: tags.website || tags['contact:website'] || '',
      opening_hours: tags.opening_hours || '',
      touchless_signal: isTouchlessSignal,
    };
    missing.push(row);
    stateMissing++;
    if (isTouchlessSignal) { touchlessMissing.push(row); stateTouchless++; }
  }
  totalFound += elements.length;
  byStateStats.push({ state: s.code, found: elements.length, matched: elements.length - stateMissing, missing: stateMissing, touchless: stateTouchless });
  console.log(`  ${elements.length.toString().padStart(4)} found · ${stateMissing.toString().padStart(4)} missing · ${stateTouchless.toString().padStart(3)} touchless`);
  await new Promise(r => setTimeout(r, 1500)); // throttle Overpass
}

console.log(`\n=== Sweep complete ===`);
console.log(`  Total OSM car washes seen: ${totalFound}`);
console.log(`  Matched to existing DB:    ${totalMatched}`);
console.log(`  Missing from our DB:       ${missing.length}`);
console.log(`  ...with touchless signal:  ${touchlessMissing.length}`);

// ── Write outputs ──
const csvEscape = v => { if (v == null) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const cols = ['touchless_signal','name','brand','address','city','state','zip','lat','lng','car_wash_type','automated','self_service','phone','website','opening_hours','osm_id'];

const allLines = [cols.join(',')];
for (const m of missing) allLines.push(cols.map(k => csvEscape(m[k])).join(','));
writeFileSync(resolve(outDir, 'osm-missing-all.csv'), allLines.join('\n'));

const touchlessLines = [cols.join(',')];
for (const m of touchlessMissing) touchlessLines.push(cols.map(k => csvEscape(m[k])).join(','));
writeFileSync(resolve(outDir, 'osm-missing-touchless.csv'), touchlessLines.join('\n'));

writeFileSync(resolve(outDir, 'osm-sweep-stats.json'), JSON.stringify({
  runAt: new Date().toISOString(),
  totalFound, totalMatched, totalMissing: missing.length, totalTouchless: touchlessMissing.length,
  byState: byStateStats,
}, null, 2));

console.log(`\nWrote: ${resolve(outDir, 'osm-missing-all.csv')}`);
console.log(`       ${resolve(outDir, 'osm-missing-touchless.csv')}`);
console.log(`       ${resolve(outDir, 'osm-sweep-stats.json')}`);
