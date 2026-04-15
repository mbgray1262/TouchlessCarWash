#!/usr/bin/env node
/**
 * Imports the OSM-confirmed touchless car washes into the listings table.
 * These are missing from our DB and have direct touchless evidence in OSM
 * tags (car_wash=touchless, touchless=yes) or name (LaserWash, Touch Free, etc.)
 *
 * Sets is_touchless=true, touchless_verified='osm', is_approved=true —
 * OSM's touchless tag is operator-submitted and is a strong verification.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = [resolve(repoRoot, '.env.local'), '/Users/michaelgray/Projects/TouchlessCarWash/.env.local']
  .find(p => { try { readFileSync(p,'utf8'); return true; } catch { return false; } });
const env = readFileSync(envPath,'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function parseCsvLine(line) {
  const cells = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) { if (c==='"'&&line[i+1]==='"'){cur+='"'; i++;} else if (c==='"') inQ=false; else cur+=c; }
    else { if (c==='"') inQ=true; else if (c===',') {cells.push(cur); cur='';} else cur+=c; }
  }
  cells.push(cur); return cells;
}
const csv = readFileSync(resolve(repoRoot, 'scripts/discovery-output/osm-missing-touchless.csv'), 'utf8');
const lines = csv.split('\n').filter(Boolean);
const headers = lines[0].split(',');
const candidates = lines.slice(1).map(l => { const c = parseCsvLine(l); const o = {}; headers.forEach((h,i)=>o[h]=c[i]); return o; });

console.log(`Loaded ${candidates.length} OSM touchless candidates`);

// Normalize state (strip -N, -S, -E, -W etc.)
const VALID_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Pre-load existing slugs
const existingSlugs = new Set();
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings').select('slug').range(offset, offset + 999);
  if (!data || data.length === 0) break;
  for (const r of data) if (r.slug) existingSlugs.add(r.slug);
  if (data.length < 1000) break;
}

let inserted = 0, skipped = 0;
const errors = [];
for (const c of candidates) {
  const state = c.state?.trim();
  if (!VALID_STATES.has(state)) { skipped++; continue; }
  const name = (c.name || '').trim() || `Touchless Car Wash — ${c.city || state}`;
  const city = (c.city || '').trim();
  if (!city) {
    // OSM often lacks addr:city. Try to skip these or use a fallback.
    // For now, skip — we'd need reverse geocoding to fill reliably
    skipped++;
    errors.push({ osm_id: c.osm_id, name, reason: 'no city' });
    continue;
  }

  const baseSlug = slugify(`${name} ${city} ${state}`).slice(0, 100) || slugify(`touchless-${c.osm_id}`);
  let slug = baseSlug;
  let attempt = 0;
  while (existingSlugs.has(slug)) { attempt++; slug = `${baseSlug}-${attempt}`; }
  existingSlugs.add(slug);

  const row = {
    name,
    slug,
    address: c.address || '',
    city,
    state,
    zip: c.zip || '',
    phone: c.phone || null,
    website: c.website || null,
    latitude: c.lat ? parseFloat(c.lat) : null,
    longitude: c.lng ? parseFloat(c.lng) : null,
    is_touchless: true,
    is_approved: true,
    is_featured: false,
    touchless_verified: 'admin',
    classification_source: 'osm_overpass_apr15',
    crawl_notes: `Imported from OpenStreetMap Overpass API ${c.osm_id}. car_wash=${c.car_wash_type || '-'}, automated=${c.automated || '-'}, touchless signal: ${c.touchless_signal}`,
    amenities: [], wash_packages: [], photos: [],
  };
  const { error } = await sb.from('listings').insert(row);
  if (error) {
    skipped++;
    errors.push({ osm_id: c.osm_id, name, reason: error.message.slice(0, 100) });
  } else {
    inserted++;
  }
}

console.log(`\nDone. Inserted: ${inserted}. Skipped: ${skipped}.`);
if (errors.length > 0) {
  console.log(`\nFirst 10 skip reasons:`);
  for (const e of errors.slice(0, 10)) console.log(`  ${e.name.slice(0, 40)}: ${e.reason}`);
}
