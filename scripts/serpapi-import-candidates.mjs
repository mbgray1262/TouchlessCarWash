#!/usr/bin/env node
/**
 * Imports the 1,032 SerpAPI-discovered candidates into `listings` with
 *   is_touchless = null  (unverified — won't appear in sitemap/pages)
 *   is_approved = false  (gate against accidental display)
 *   review_mine_status = null (queues them for the existing review-mine pipeline)
 *
 * All data is from what we already paid for in the discovery sweep — no new
 * SerpAPI calls. Downstream:
 *   - review-mine pipeline classifies them (flips is_touchless=true/false)
 *   - Crawl4AI pulls website data for confirmed-touchless listings
 *   - AI description generator runs on confirmed-touchless listings
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

function parseCsvLine(line) {
  const cells = []; let cur = '', inQ = false;
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

const csv = readFileSync(resolve(repoRoot, 'scripts/discovery-output/serpapi-shortlist.csv'), 'utf8');
const lines = csv.split('\n').filter(Boolean);
const headers = lines[0].split(',');
const candidates = lines.slice(1).map(l => {
  const cells = parseCsvLine(l);
  const o = {};
  headers.forEach((h, i) => o[h] = cells[i]);
  return o;
});
console.log(`Loaded ${candidates.length} shortlisted candidates`);

// Parse "4915 Lemmon Ave, Dallas, TX 75219, United States" → { street, city, state, zip }
function parseAddress(addr) {
  if (!addr) return { street: '', city: '', state: '', zip: '' };
  // Strip trailing ", United States"
  const clean = addr.replace(/,\s*United States\s*$/i, '').trim();
  // Match: "<street>, <city>, <ST> <zip>"
  const m = clean.match(/^(.*?),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  if (m) return { street: m[1].trim(), city: m[2].trim(), state: m[3], zip: m[4] || '' };
  // Fallback: "<city>, <ST> <zip>" with no street
  const m2 = clean.match(/^([^,]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  if (m2) return { street: '', city: m2[1].trim(), state: m2[2], zip: m2[3] || '' };
  return { street: clean, city: '', state: '', zip: '' };
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Upscale Google thumbnail URLs to larger size (pattern from import-chain-locations.py)
function upscaleGooglePhoto(url) {
  if (!url) return null;
  if (url.includes('/gps-cs-s/')) return null; // expiring session tokens
  if (url.includes('googleusercontent.com') || url.includes('lh3.google')) {
    const base = url.replace(/=[^/=]+$/, '');
    return `${base}=w1600-h1200`;
  }
  return url;
}

// Pre-fetch existing slugs to avoid collisions (paginated past 1000-row limit)
console.log('Loading existing slugs for collision check...');
const existingSlugs = new Set();
for (let offset = 0; offset < 40000; offset += 1000) {
  const { data } = await sb.from('listings').select('slug').range(offset, offset + 999);
  if (!data || data.length === 0) break;
  for (const r of data) if (r.slug) existingSlugs.add(r.slug);
  if (data.length < 1000) break;
}
console.log(`  ${existingSlugs.size} existing slugs loaded`);

async function makeUniqueSlug(base) {
  let slug = base;
  let attempt = 0;
  while (existingSlugs.has(slug)) {
    attempt++;
    slug = `${base}-${attempt}`;
  }
  existingSlugs.add(slug);
  return slug;
}

const errors = [];
let inserted = 0, skipped = 0;
const VALID_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);

for (let i = 0; i < candidates.length; i++) {
  const c = candidates[i];
  const { street, city, state, zip } = parseAddress(c.address);
  if (!VALID_STATES.has(state)) {
    errors.push({ place_id: c.place_id, name: c.name, reason: `unparseable state from "${c.address}"` });
    skipped++;
    continue;
  }
  const baseSlug = slugify(`${c.name} ${city} ${state}`).slice(0, 100) || slugify(c.name).slice(0, 100);
  const slug = await makeUniqueSlug(baseSlug);

  const row = {
    google_place_id: c.place_id,
    name: c.name,
    slug,
    address: street,
    city,
    state,
    zip,
    phone: c.phone || null,
    latitude: c.lat ? parseFloat(c.lat) : null,
    longitude: c.lng ? parseFloat(c.lng) : null,
    rating: c.rating ? parseFloat(c.rating) : null,
    review_count: c.reviews ? parseInt(c.reviews, 10) : null,
    google_photo_url: upscaleGooglePhoto(c.thumbnail),
    is_touchless: null,          // unverified — review-mine pipeline will classify
    is_approved: false,          // gate against display until verified
    is_featured: false,
    amenities: [],
    wash_packages: [],
    photos: [],
  };

  const { error } = await sb.from('listings').insert(row);
  if (error) {
    // Duplicate google_place_id → skip silently
    if (error.code === '23505' && error.message.includes('google_place_id')) {
      skipped++;
    } else {
      errors.push({ place_id: c.place_id, name: c.name, reason: error.message });
      skipped++;
    }
  } else {
    inserted++;
  }

  if ((i + 1) % 100 === 0) {
    console.log(`  ${i + 1}/${candidates.length} · inserted ${inserted} · skipped ${skipped}`);
  }
}

console.log(`\nDone. Inserted: ${inserted}. Skipped: ${skipped}.`);
if (errors.length > 0) {
  writeFileSync(resolve(repoRoot, 'scripts/discovery-output/serpapi-import-errors.json'), JSON.stringify(errors, null, 2));
  console.log(`Errors: ${errors.length} (see scripts/discovery-output/serpapi-import-errors.json)`);
}

// Verify
const { count: unverifiedCount } = await sb.from('listings').select('*',{count:'exact',head:true}).is('is_touchless',null).eq('is_approved',false).not('google_place_id','is',null);
console.log(`Total unverified pending-review rows in DB: ${unverifiedCount}`);
