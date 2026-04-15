#!/usr/bin/env node
/**
 * Retries the OSM Overpass states that failed in the first sweep, with
 * slower throttling (4s between queries) and longer retries on failure.
 * Merges results into the existing osm-missing-*.csv files.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = [resolve(repoRoot, '.env.local'), '/Users/michaelgray/Projects/TouchlessCarWash/.env.local']
  .find(p => { try { readFileSync(p,'utf8'); return true; } catch { return false; } });
const env = readFileSync(envPath,'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Read prior stats to find failed states
const prior = JSON.parse(readFileSync(resolve(repoRoot, 'scripts/discovery-output/osm-sweep-stats.json'), 'utf8'));
const failedStates = prior.byState.filter(s => s.error || s.found === 0).map(s => s.state);
console.log(`Retrying ${failedStates.length} failed states: ${failedStates.join(', ')}`);

const BBOXES = {
  'AK': [51.20, -179.15, 71.54, -129.97],
  'CA-S': [32.53, -124.41, 36.01, -114.13],
  'FL-N': [28.50, -87.63, 31.00, -79.97],
  'GA': [30.36, -85.61, 35.00, -80.75],
  'ID': [41.99, -117.24, 49.00, -111.04],
  'IL': [36.97, -91.51, 42.51, -87.02],
  'IA': [40.38, -96.64, 43.50, -90.14],
  'LA': [28.93, -94.04, 33.02, -88.82],
  'ME': [43.06, -71.08, 47.46, -66.95],
  'MD': [37.89, -79.49, 39.72, -75.05],
  'MA': [41.24, -73.51, 42.89, -69.93],
  'MS': [30.17, -91.66, 34.99, -88.10],
  'MO': [35.99, -95.77, 40.61, -89.10],
  'NH': [42.70, -72.56, 45.31, -70.61],
  'NJ': [38.92, -75.56, 41.36, -73.89],
  'NC': [33.84, -84.32, 36.59, -75.46],
  'ND': [45.94, -104.05, 49.00, -96.55],
  'OK': [33.62, -103.00, 37.00, -94.43],
  'PA-E': [39.72, -78.00, 42.27, -74.69],
  'RI': [41.15, -71.86, 42.02, -71.12],
  'TX-W': [25.84, -106.65, 36.50, -100.00],
  'UT': [36.99, -114.05, 42.00, -109.04],
  'VT': [42.73, -73.44, 45.02, -71.46],
  'VA': [36.54, -83.68, 39.47, -75.24],
  'DC': [38.79, -77.12, 38.99, -76.91],
};

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

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
  const query = `[out:json][timeout:180];
(
  node["amenity"="car_wash"](${minLat},${minLng},${maxLat},${maxLng});
  way["amenity"="car_wash"](${minLat},${minLng},${maxLat},${maxLng});
);
out tags center;`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'text/plain'}, body: query });
      if (res.status === 429 || res.status === 504) {
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.elements || [];
    } catch (e) {
      console.error(`  ! ${state} attempt ${attempt+1}: ${e.message.slice(0,70)}`);
      await new Promise(r => setTimeout(r, 6000));
    }
  }
  return null;
}

// Load existing coords (reuse)
const existing = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings').select('id, latitude, longitude').not('latitude','is',null).not('longitude','is',null).range(offset, offset+999);
  if (!data || data.length === 0) break;
  for (const r of data) existing.push({ id: r.id, lat: r.latitude, lng: r.longitude });
  if (data.length < 1000) break;
}
console.log(`  ${existing.length} DB listings loaded`);

const CELL_SIZE = 0.15;
const cellMap = new Map();
function cellKey(lat, lng) { return `${Math.floor(lat/CELL_SIZE)}_${Math.floor(lng/CELL_SIZE)}`; }
for (const e of existing) {
  const k = cellKey(e.lat, e.lng);
  if (!cellMap.has(k)) cellMap.set(k, []);
  cellMap.get(k).push(e);
}
function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function nearestExisting(lat, lng, maxMiles = 0.1) {
  const cellLat = Math.floor(lat / CELL_SIZE), cellLng = Math.floor(lng / CELL_SIZE);
  for (let dLat=-1; dLat<=1; dLat++) for (let dLng=-1; dLng<=1; dLng++) {
    const bucket = cellMap.get(`${cellLat+dLat}_${cellLng+dLng}`);
    if (!bucket) continue;
    for (const e of bucket) if (haversineMiles(lat,lng,e.lat,e.lng) <= maxMiles) return e;
  }
  return null;
}

const newMissing = [], newTouchless = [];
const updatedStats = [];
let totalFound = 0;

for (const code of failedStates) {
  if (!BBOXES[code]) { console.log(`  ${code} — no bbox defined`); continue; }
  process.stdout.write(`  ${code.padEnd(8)}`);
  const elements = await queryState(BBOXES[code], code);
  if (elements === null) {
    console.log(` STILL FAILED`);
    updatedStats.push({ state: code, found: 0, missing: 0, touchless: 0, error: true });
    continue;
  }
  let missing = 0, touchless = 0;
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!lat || !lng) continue;
    if (nearestExisting(lat, lng)) continue;
    const tags = el.tags || {};
    const isTouchless = osmSignalsTouchless(tags);
    const row = {
      osm_id: `${el.type}/${el.id}`,
      name: tags.name || '', brand: tags.brand || '', lat, lng, state: code.split('-')[0],
      car_wash_type: tags.car_wash || '', automated: tags.automated || '', self_service: tags.self_service || '',
      address: [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
      city: tags['addr:city'] || '', zip: tags['addr:postcode'] || '',
      phone: tags.phone || tags['contact:phone'] || '',
      website: tags.website || tags['contact:website'] || '',
      opening_hours: tags.opening_hours || '',
      touchless_signal: isTouchless,
    };
    newMissing.push(row);
    missing++;
    if (isTouchless) { newTouchless.push(row); touchless++; }
  }
  totalFound += elements.length;
  updatedStats.push({ state: code, found: elements.length, missing, touchless });
  console.log(` ${elements.length.toString().padStart(4)} found · ${missing.toString().padStart(4)} missing · ${touchless.toString().padStart(3)} touchless`);
  await new Promise(r => setTimeout(r, 4000));
}

// Merge into existing CSVs
function parseCsvLine(line) {
  const cells = []; let cur = '', inQ = false;
  for (let i=0; i<line.length; i++) {
    const c = line[i];
    if (inQ) { if (c==='"'&&line[i+1]==='"'){cur+='"'; i++;} else if (c==='"') inQ=false; else cur+=c; }
    else { if (c==='"') inQ=true; else if (c===',') {cells.push(cur); cur='';} else cur+=c; }
  }
  cells.push(cur); return cells;
}

function appendToCsv(path, rows, cols) {
  const existing = readFileSync(path, 'utf8');
  const csvEscape = v => { if (v==null) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const newLines = rows.map(r => cols.map(k => csvEscape(r[k])).join(','));
  writeFileSync(path, existing + '\n' + newLines.join('\n'));
}

const cols = ['touchless_signal','name','brand','address','city','state','zip','lat','lng','car_wash_type','automated','self_service','phone','website','opening_hours','osm_id'];
const outDir = resolve(repoRoot, 'scripts/discovery-output');
appendToCsv(resolve(outDir, 'osm-missing-all.csv'), newMissing, cols);
appendToCsv(resolve(outDir, 'osm-missing-touchless.csv'), newTouchless, cols);

// Update stats
const statsPath = resolve(outDir, 'osm-sweep-stats.json');
const stats = JSON.parse(readFileSync(statsPath, 'utf8'));
for (const u of updatedStats) {
  const existing = stats.byState.find(s => s.state === u.state);
  if (existing) Object.assign(existing, u);
  else stats.byState.push(u);
}
stats.totalFound += totalFound;
stats.totalMissing += newMissing.length;
stats.totalTouchless += newTouchless.length;
stats.retryRunAt = new Date().toISOString();
writeFileSync(statsPath, JSON.stringify(stats, null, 2));

console.log(`\n=== Retry complete ===`);
console.log(`  Added from retry: ${totalFound} found, ${newMissing.length} missing, ${newTouchless.length} touchless`);
console.log(`  Grand total missing: ${stats.totalMissing}`);
console.log(`  Grand total touchless-signal: ${stats.totalTouchless}`);
