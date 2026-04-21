#!/usr/bin/env node
/**
 * Fill missing hours on touchless listings that are approval-eligible except
 * for missing hours. Calls Google Places API v1 for each, extracts
 * regularOpeningHours, writes it to listings.hours.
 *
 * After hours are filled, triggers a re-approval check — any listing that
 * now has hero + description + hours + lat/lng flips to is_approved=true.
 *
 * Cost: ~$15 per 1,000 Places Details calls (Pro SKU with opening hours).
 * For the current ~200 held listings, total cost is roughly $3.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env = readFileSync(resolve(repoRoot,'.env.local'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const GOOGLE_KEY = env.GOOGLE_PLACES_API_KEY;
if (!GOOGLE_KEY) { console.error('Missing GOOGLE_PLACES_API_KEY'); process.exit(1); }
const LOG = resolve(repoRoot, 'scripts/fill-missing-hours-from-places.log');
const DRY_RUN = process.argv.includes('--dry-run');

function log(msg) {
  const line = `[${new Date().toISOString().slice(11,19)}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

/**
 * Google Places v1 returns opening hours as an object with weekdayDescriptions
 * (an array of "Monday: 8:00 AM – 9:00 PM" strings). We convert that to the
 * { monday: "8:00 AM – 9:00 PM", ... } shape the app already uses.
 */
function placesHoursToListingHours(placesHours) {
  const out = {};
  if (!placesHours?.weekdayDescriptions) return out;
  for (const line of placesHours.weekdayDescriptions) {
    const [dayRaw, ...rest] = line.split(':');
    if (!dayRaw || rest.length === 0) continue;
    const day = dayRaw.trim().toLowerCase();
    const value = rest.join(':').trim();
    // Valid day names only; skip anything weird
    if (!['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].includes(day)) continue;
    out[day] = value;
  }
  return out;
}

async function fetchPlace(placeId) {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?key=${GOOGLE_KEY}`,
      { headers: { 'X-Goog-FieldMask': 'regularOpeningHours,businessStatus' }, signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) { return { error: e.message }; }
}

async function main() {
  appendFileSync(LOG, `\n=== fill-missing-hours-from-places ${new Date().toISOString()} (dry=${DRY_RUN}) ===\n`);

  // Find the target listings: is_touchless=true, is_approved=false, have a
  // hero, have a google_place_id, and are missing hours (the primary block).
  const PAGE = 1000;
  const candidates = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from('listings')
      .select('id, name, city, state, description, hours, hero_image, latitude, longitude, google_place_id')
      .eq('is_touchless', true).eq('is_approved', false)
      .not('hero_image', 'is', null).not('google_place_id', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    candidates.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // Filter to only ones actually missing hours
  const needHours = candidates.filter(l => !l.hours || Object.keys(l.hours).length === 0);
  log(`Found ${needHours.length} listings with hero but no hours (out of ${candidates.length} held)`);

  let gotHours = 0, noHours = 0, errors = 0, approved = 0, stillHeld = 0;
  for (let i = 0; i < needHours.length; i++) {
    const l = needHours[i];
    const place = await fetchPlace(l.google_place_id);
    if (place.error) {
      errors++;
      if (errors < 5) log(`  ⚠ ${l.name}: ${place.error}`);
      continue;
    }
    const hours = placesHoursToListingHours(place.regularOpeningHours);
    if (Object.keys(hours).length === 0) {
      noHours++;
      continue;
    }
    gotHours++;
    if (DRY_RUN) {
      if (i < 3) log(`  [${i+1}/${needHours.length}] ${l.name} — would set ${Object.keys(hours).length} days`);
      continue;
    }

    // Write hours
    const { error: upErr } = await sb.from('listings').update({ hours }).eq('id', l.id);
    if (upErr) { errors++; log(`  ⚠ ${l.name}: update error ${upErr.message.slice(0,100)}`); continue; }

    // Re-check approval gate now that hours are set
    const hasDesc = !!l.description && l.description.length >= 40;
    const hasCoords = l.latitude != null && l.longitude != null;
    if (hasDesc && hasCoords) {
      const { error: apErr } = await sb.from('listings').update({ is_approved: true }).eq('id', l.id);
      if (!apErr) approved++; else errors++;
    } else {
      stillHeld++;
    }

    if (i % 25 === 0) log(`  progress: ${i+1}/${needHours.length} | got=${gotHours} approved=${approved} stillheld=${stillHeld} noh=${noHours} err=${errors}`);
  }

  log(`\nDONE:`);
  log(`  Fetched hours successfully:      ${gotHours}`);
  log(`  Google returned no opening hours: ${noHours}`);
  log(`  API errors:                       ${errors}`);
  log(`  Re-approved after hours landed:   ${approved}`);
  log(`  Got hours but still missing desc: ${stillHeld}`);
}

main().catch(e => { log(`FATAL ${e.message}`); process.exit(1); });
