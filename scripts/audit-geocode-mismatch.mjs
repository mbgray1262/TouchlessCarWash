/**
 * audit-geocode-mismatch.mjs
 *
 * Finds approved touchless listings whose stored latitude/longitude don't match
 * their city — the "chain geocode-mismatch" class of data bug. A wrong coordinate
 * silently corrupts the listing's map pin, its "nearby washes" section, metro
 * clustering, and (before lib/nearby-augment.ts#bestNearby made the count robust)
 * could even drop a whole city hub from the sitemap.
 *
 * Detection (no external calls — pure distance math over current data):
 *   - State bounding box: flag any listing whose coords fall OUTSIDE its claimed
 *     state's box (or out of the US entirely). This is independent of city peers,
 *     so it's the only pass that catches a mis-geocode in a SINGLE-listing city.
 *   - Cities with >=3 listings: flag any listing > OUTLIER_MILES (50) from the
 *     MEDIAN coordinate of its same-(state,city) peers. Median is robust to a
 *     single bad point. NOTE: a city with MULTIPLE bad points can drag the median
 *     onto a wrong spot and hide an outlier — so --fix loops until the audit is
 *     clean (each fix shifts the median back and can expose the next one).
 *   - Cities with exactly 2 listings: flag the pair when they're > PAIR_MILES
 *     (100) apart (ambiguous — which one is wrong is decided by re-geocoding).
 *
 * Set PEER_MILES env to tighten the multi-listing-city threshold below 50 for a
 * deeper sweep (e.g. PEER_MILES=25 surfaced 2 nearer in-state errors on 2026-06-13:
 * a Clarksville TN wash sitting at Nashville, an Auburn MA wash ~34mi east).
 *
 * Fixing (--fix): re-geocode each flagged listing from its own street address via
 * Nominatim/OpenStreetMap (free; ~1 req/sec, per the project's free-API
 * preference). The stored coords are overwritten ONLY when the geocode result
 * lands confidently in the right place — its postcode matches the listing zip OR
 * its city matches the listing city — AND it differs from the stored coords by
 * > OUTLIER_MILES. Anything ambiguous or un-geocodable is reported, never guessed.
 *
 * READ-ONLY by default.
 *   node scripts/audit-geocode-mismatch.mjs          # report only
 *   node scripts/audit-geocode-mismatch.mjs --fix    # report + re-geocode + update
 *
 * Last full sweep: 2026-06-13 — fixed 41 listings (mostly Power Market / Kwik
 * Trip / Holiday chains, e.g. a Rocklin CA wash geocoded ~150mi away near Merced),
 * audit converged to 0 outliers / 0 ambiguous pairs across 4,489 listings.
 * Re-run after any review/listing mining batch.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error('Missing SUPABASE env vars in .env.local');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, KEY);

const DO_FIX = process.argv.includes('--fix');
const OUTLIER_MILES = Number(env.PEER_MILES || process.env.PEER_MILES || 50);
const PAIR_MILES = 100;
const CONFIDENT_FIX_MILES = 30; // geocode must be this close to the city to auto-apply

// Approximate state bounding boxes [minLat,maxLat,minLng,maxLng], with generous
// margins so only CLEAR cross-state errors flag (legit border towns won't).
const STATE_BBOX = {
  AL:[30.1,35.1,-88.6,-84.8],AK:[51.0,71.6,-179.9,-129.0],AZ:[31.2,37.1,-114.9,-108.9],AR:[32.9,36.6,-94.7,-89.5],
  CA:[32.4,42.1,-124.5,-114.0],CO:[36.9,41.1,-109.1,-101.9],CT:[40.9,42.1,-73.8,-71.7],DE:[38.4,39.9,-75.8,-75.0],
  DC:[38.7,39.1,-77.2,-76.8],FL:[24.3,31.1,-87.7,-79.9],GA:[30.3,35.1,-85.7,-80.8],HI:[18.8,22.3,-160.3,-154.7],
  ID:[41.9,49.1,-117.3,-110.9],IL:[36.9,42.6,-91.6,-87.4],IN:[37.7,41.8,-88.2,-84.7],IA:[40.3,43.6,-96.7,-90.1],
  KS:[36.9,40.1,-102.1,-94.5],KY:[36.4,39.2,-89.7,-81.9],LA:[28.8,33.1,-94.1,-88.7],ME:[42.9,47.5,-71.2,-66.9],
  MD:[37.8,39.8,-79.5,-75.0],MA:[41.1,42.9,-73.6,-69.8],MI:[41.6,48.3,-90.5,-82.3],MN:[43.4,49.5,-97.3,-89.4],
  MS:[30.1,35.1,-91.7,-88.0],MO:[35.9,40.7,-95.9,-89.0],MT:[44.3,49.1,-116.2,-103.9],NE:[39.9,43.1,-104.1,-95.2],
  NV:[34.9,42.1,-120.1,-113.9],NH:[42.6,45.4,-72.6,-70.6],NJ:[38.8,41.4,-75.6,-73.8],NM:[31.2,37.1,-109.1,-102.9],
  NY:[40.4,45.1,-79.9,-71.8],NC:[33.7,36.7,-84.4,-75.4],ND:[45.8,49.1,-104.1,-96.5],OH:[38.3,42.4,-84.9,-80.4],
  OK:[33.5,37.1,-103.1,-94.4],OR:[41.9,46.4,-124.6,-116.4],PA:[39.6,42.4,-80.6,-74.6],RI:[41.0,42.1,-71.9,-71.0],
  SC:[31.9,35.3,-83.5,-78.4],SD:[42.4,46.0,-104.1,-96.3],TN:[34.9,36.8,-90.4,-81.5],TX:[25.7,36.6,-106.8,-93.4],
  UT:[36.9,42.1,-114.1,-108.9],VT:[42.6,45.1,-73.5,-71.4],VA:[36.4,39.6,-83.8,-75.1],WA:[45.4,49.1,-124.9,-116.8],
  WV:[37.1,40.7,-82.7,-77.6],WI:[42.4,47.4,-92.9,-86.7],WY:[40.9,45.1,-111.1,-103.9],
};
/** True when (lat,lng) is implausible for `state` (out of US, or outside its bbox). */
function outsideState(state, lat, lng) {
  if (lat === 0 || lng === 0 || lat < 18 || lat > 72 || lng < -180 || lng > -66) return true;
  const bb = STATE_BBOX[state];
  if (!bb) return false; // unknown/non-US state code — handled elsewhere
  return lat < bb[0] || lat > bb[1] || lng < bb[2] || lng > bb[3];
}

const toRad = (d) => (d * Math.PI) / 180;
const haversine = (a, b, c, d) => {
  const R = 3959;
  const dLat = toRad(c - a);
  const dLng = toRad(d - b);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
};
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadListings() {
  const all = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb
      .from('listings')
      .select('id,name,address,city,state,zip,latitude,longitude')
      .eq('is_touchless', true)
      .eq('is_approved', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('id', { ascending: true }) // stable key — REQUIRED for correct .range() paging
      .range(off, off + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

/** Return the set of listings whose coords look wrong, given the current data. */
function findOutliers(all) {
  const groups = new Map();
  for (const l of all) {
    const k = `${l.state}||${(l.city || '').toLowerCase().trim()}`;
    (groups.get(k) ?? groups.set(k, []).get(k)).push(l);
  }
  const out = [];
  const seen = new Set();
  // Pass 1 (peer-independent): coords outside the listing's own state.
  for (const l of all) {
    if (outsideState(l.state, +l.latitude, +l.longitude)) {
      out.push({ ...l, dist: 9999, refLat: null, refLng: null, kind: 'WRONG-STATE' });
      seen.add(l.id);
    }
  }
  // Pass 2 (peer-based): per-city outliers and ambiguous pairs.
  for (const [, rows] of groups) {
    if (rows.length >= 3) {
      const mlat = median(rows.map((r) => +r.latitude));
      const mlng = median(rows.map((r) => +r.longitude));
      for (const r of rows) {
        if (seen.has(r.id)) continue;
        const dist = haversine(mlat, mlng, +r.latitude, +r.longitude);
        if (dist > OUTLIER_MILES) { out.push({ ...r, dist: Math.round(dist), refLat: mlat, refLng: mlng, kind: 'OUTLIER' }); seen.add(r.id); }
      }
    } else if (rows.length === 2) {
      const dist = haversine(+rows[0].latitude, +rows[0].longitude, +rows[1].latitude, +rows[1].longitude);
      if (dist > PAIR_MILES) {
        // ambiguous: include BOTH; re-geocoding each by its own address decides.
        for (const r of rows) { if (seen.has(r.id)) continue; out.push({ ...r, dist: Math.round(dist), refLat: null, refLng: null, ambiguous: true, kind: 'PAIR' }); seen.add(r.id); }
      }
    }
  }
  return out.sort((a, b) => b.dist - a.dist);
}

async function geocode(listing) {
  // Avoid duplicating "City, ST ZIP" when the address column already contains it.
  const hasRegion = /\b([A-Z]{2}\s+\d{5}|California|Texas|Wisconsin|Oregon|Washington|Minnesota|Illinois)\b/i.test(listing.address || '');
  const q = hasRegion ? listing.address : `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip || ''}`.trim();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=us&addressdetails=1&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'TouchlessCarWashFinder/1.0 (geocode-audit; michael@touchlesscarwashfinder.com)' },
  });
  if (!r.ok) return { q, results: [] };
  return { q, results: await r.json() };
}

async function run() {
  let all = await loadListings();
  console.log(`Loaded ${all.length} approved touchless listings with coordinates.\n`);

  if (!DO_FIX) {
    const outliers = findOutliers(all);
    for (const o of outliers) {
      const distLabel = o.kind === 'WRONG-STATE' ? 'outside state' : `${o.dist}mi`;
      console.log(
        `${o.kind.padEnd(11)} ${distLabel} | ${o.state}/${o.city} | ${o.name} | zip=${o.zip} | (${o.latitude},${o.longitude})`,
      );
    }
    console.log(`\n${outliers.length} flagged listing(s). Re-run with --fix to re-geocode them.`);
    return;
  }

  // --fix: loop until convergence (fixing median-dragging hides no further outliers).
  let totalFixed = 0, totalSkipped = 0, round = 0;
  while (true) {
    round++;
    const outliers = findOutliers(all);
    if (outliers.length === 0) {
      console.log(`\nConverged after ${round - 1} round(s). No remaining outliers.`);
      break;
    }
    console.log(`--- Round ${round}: ${outliers.length} flagged ---`);
    let roundFixed = 0;
    for (const o of outliers) {
      const { q, results } = await geocode(o);
      await sleep(1200); // Nominatim rate limit
      let pick =
        (o.zip && results.find((x) => x.address?.postcode === String(o.zip))) ||
        results.find((x) => (x.address?.city || x.address?.town || x.address?.village || '').toLowerCase() === String(o.city).toLowerCase()) ||
        results[0];
      if (!pick) {
        console.log(`  SKIP (no geocode) | ${o.state}/${o.city} | ${o.name} | "${q}"`);
        totalSkipped++;
        continue;
      }
      const glat = +pick.lat, glng = +pick.lon;
      const zipMatch = o.zip && pick.address?.postcode === String(o.zip);
      const cityMatch = (pick.address?.city || pick.address?.town || pick.address?.village || '').toLowerCase() === String(o.city).toLowerCase();
      const distStored = haversine(+o.latitude, +o.longitude, glat, glng);
      // Reference check: if we have a city median, the geocode must agree with it.
      const refOk = o.refLat == null || haversine(o.refLat, o.refLng, glat, glng) <= CONFIDENT_FIX_MILES;
      if (distStored <= OUTLIER_MILES) {
        // Stored coords already agree with the address — this listing is fine; the
        // city median was dragged by OTHER bad rows. Leave it; they'll be fixed.
        continue;
      }
      if (!(zipMatch || cityMatch) || !refOk) {
        console.log(`  SKIP (low confidence) | ${o.state}/${o.city} | ${o.name} | got ${pick.address?.postcode}/${pick.address?.city || pick.address?.town} | "${q}"`);
        totalSkipped++;
        continue;
      }
      const { error } = await sb.from('listings').update({ latitude: glat, longitude: glng }).eq('id', o.id);
      if (error) {
        console.log(`  ERROR | ${o.name} | ${error.message}`);
        totalSkipped++;
        continue;
      }
      console.log(`  FIXED (${Math.round(distStored)}mi off${o.kind === 'WRONG-STATE' ? ', wrong-state' : ''}) | ${o.state}/${o.city} | ${o.name} | (${o.latitude},${o.longitude}) -> (${glat},${glng})`);
      // reflect the change in-memory so the next round's median is up to date
      const ref = all.find((x) => x.id === o.id);
      if (ref) { ref.latitude = glat; ref.longitude = glng; }
      roundFixed++; totalFixed++;
    }
    if (roundFixed === 0) {
      console.log(`\nNo further confident fixes possible. ${outliers.length} listing(s) remain for manual review.`);
      break;
    }
  }
  console.log(`\nSUMMARY: fixed=${totalFixed} skipped=${totalSkipped}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
