/**
 * Backfill missing street addresses from COORDINATES via Nominatim (OpenStreetMap) reverse
 * geocoding. Our imports left ~2,460 listings with lat/lng but a blank address (and usually no
 * place_id, so Google Places can't help + our Google Geocoding key is disabled). Street View
 * works off the coordinate, which is why these show a street-view image but no address.
 *
 * Nominatim is FREE. Its usage policy caps us at ~1 request/second and REQUIRES a descriptive
 * User-Agent, so this is throttled to 1.1s/request (≈ 45 min for the full set) and resumable.
 *
 * SAFE writes:
 *   - address: only written when reverse-geocode returns a real street (road; house_number if any).
 *              A result with only a city/region is NOT written (a vague address is worse than none).
 *   - city / zip: filled only when currently empty.
 *   - state: filled only when currently empty AND the geocoded US state code is valid. NEVER
 *            overwrites an existing state (that's the wrong-state integrity risk — we only LOG a
 *            mismatch for later review). Non-US results (country_code != us) are skipped entirely
 *            (foreign coords are bad data per CLAUDE.md — a listing must have a valid US state).
 *
 *   node scripts/backfill-addresses-nominatim.mjs --limit 10 --dry   # validate, no writes
 *   node scripts/backfill-addresses-nominatim.mjs --apply            # real, resumable
 *   --hand-wash   restrict to is_hand_wash listings (the 40 in the review queue)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const args = process.argv.slice(2);
const DRY = !args.includes('--apply');
const HAND_WASH = args.includes('--hand-wash');
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : 0; })();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const US_STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));

// Nominatim requires a real, contactable User-Agent (usage policy). Identify the project.
const UA = 'TouchlessCarWashFinder-address-backfill/1.0 (https://touchlesscarwashfinder.com; admin contact)';

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {                 // one retry — transient failures
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`nominatim ${r.status}`);
      return await r.json();
    } catch (e) { lastErr = e; if (attempt === 0) await sleep(1500); }
  }
  throw lastErr;
}

function parse(nom) {
  const a = nom?.address || {};
  if ((a.country_code || '').toLowerCase() !== 'us') return { nonUS: true };
  const road = a.road || a.pedestrian || a.footway || null;
  const address = road ? (a.house_number ? `${a.house_number} ${road}` : road) : null;
  const city = a.city || a.town || a.village || a.hamlet || a.municipality || a.suburb || a.neighbourhood || null;
  const zip = a.postcode || null;
  const iso = a['ISO3166-2-lvl4'] || '';                 // e.g. "US-CA"
  const stateCode = iso.startsWith('US-') ? iso.slice(3) : null;
  const state = stateCode && US_STATES.has(stateCode) ? stateCode : null;
  return { address, city, zip, state };
}

async function fetchTargets() {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = sb.from('listings').select('id,name,address,city,state,zip,latitude,longitude')
      .or('address.is.null,address.eq.').not('latitude', 'is', null);
    if (HAND_WASH) q = q.eq('is_hand_wash', true);
    const { data, error } = await q.order('id').range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

const targets0 = await fetchTargets();
const targets = LIMIT ? targets0.slice(0, LIMIT) : targets0;
console.log(`${targets.length} listings missing address${HAND_WASH ? ' (hand-wash only)' : ''} | ${DRY ? 'DRY RUN' : 'APPLY'}\n`);

let wrote = 0, noStreet = 0, nonUS = 0, errs = 0;
const conflicts = [];   // state disagrees with coordinate → quarantine, write NOTHING
for (const l of targets) {
  try {
    const nom = await reverseGeocode(l.latitude, l.longitude);
    const p = parse(nom);
    if (p.nonUS) { nonUS++; console.log(`  ⏭  ${(l.name || '').slice(0, 34).padEnd(35)} non-US coords (${l.latitude},${l.longitude}) — skipped`); await sleep(1100); continue; }
    // QUARANTINE: coordinate's state disagrees with the stored state. One of them is wrong
    // (bad import); writing a geocoded address here would bake in a contradiction. Skip the
    // whole record, collect it for human/authoritative review — this doubles as a wrong-state
    // audit (see project_wrong_state_and_address_integrity).
    if (p.state && (l.state || '').trim() && (l.state || '').trim().toUpperCase() !== p.state) {
      conflicts.push({ id: l.id, name: l.name, db_state: l.state, geo_state: p.state, geo_address: p.address, city: p.city, zip: p.zip, lat: l.latitude, lng: l.longitude });
      console.log(`  ⚠  ${(l.name || '').slice(0, 30).padEnd(31)} QUARANTINED — db=${l.state} vs coord=${p.state} (${p.address || p.city || '?'})`);
      await sleep(1100); continue;
    }
    if (!p.address) { noStreet++; console.log(`  ·  ${(l.name || '').slice(0, 34).padEnd(35)} no street from geocode (only ${p.city || 'region'}) — left blank`); await sleep(1100); continue; }
    const upd = { address: p.address };
    if (p.city && !(l.city || '').trim()) upd.city = p.city;
    if (p.zip && !(l.zip || '').trim()) upd.zip = p.zip;
    if (p.state && !(l.state || '').trim()) upd.state = p.state;   // only fill an EMPTY state
    console.log(`  ✓  ${(l.name || '').slice(0, 34).padEnd(35)} → ${upd.address}${upd.city ? ', ' + upd.city : ''}${upd.state ? ', ' + upd.state : ''}${upd.zip ? ' ' + upd.zip : ''}`);
    if (!DRY) { const { error } = await sb.from('listings').update(upd).eq('id', l.id); if (error) throw error; }
    wrote++;
  } catch (e) {
    errs++; console.log(`  ❌ ${(l.name || '').slice(0, 30)}: ${String(e.message || e).slice(0, 60)}`);
  }
  await sleep(1100); // Nominatim policy: max ~1 req/sec
}
if (conflicts.length) {
  const f = `scripts/_address_state_conflicts${HAND_WASH ? '_handwash' : ''}.json`;
  writeFileSync(f, JSON.stringify(conflicts, null, 2));
  console.log(`\n⚠ ${conflicts.length} state/coordinate conflicts quarantined → ${f} (review the state vs the coordinate)`);
}
console.log(`\nDONE: ${wrote} ${DRY ? 'would be written' : 'written'} | ${noStreet} no-street (left blank) | ${nonUS} non-US skipped | ${conflicts.length} quarantined conflicts | ${errs} errors`);
