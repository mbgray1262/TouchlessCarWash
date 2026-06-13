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
 *   - Cities with >=3 listings: flag any listing > OUTLIER_MILES (50) from the
 *     MEDIAN coordinate of its same-(state,city) peers. Median is robust to a
 *     single bad point. NOTE: a city with MULTIPLE bad points can drag the median
 *     onto a wrong spot and hide an outlier — so --fix loops until the audit is
 *     clean (each fix shifts the median back and can expose the next one).
 *   - Cities with exactly 2 listings: flag the pair when they're > PAIR_MILES
 *     (100) apart (ambiguous — which one is wrong is decided by re-geocoding).
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
const OUTLIER_MILES = 50;
const PAIR_MILES = 100;
const CONFIDENT_FIX_MILES = 30; // geocode must be this close to the city to auto-apply

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
  for (const [, rows] of groups) {
    if (rows.length >= 3) {
      const mlat = median(rows.map((r) => +r.latitude));
      const mlng = median(rows.map((r) => +r.longitude));
      for (const r of rows) {
        const dist = haversine(mlat, mlng, +r.latitude, +r.longitude);
        if (dist > OUTLIER_MILES) out.push({ ...r, dist: Math.round(dist), refLat: mlat, refLng: mlng });
      }
    } else if (rows.length === 2) {
      const dist = haversine(+rows[0].latitude, +rows[0].longitude, +rows[1].latitude, +rows[1].longitude);
      if (dist > PAIR_MILES) {
        // ambiguous: include BOTH; re-geocoding each by its own address decides.
        for (const r of rows) out.push({ ...r, dist: Math.round(dist), refLat: null, refLng: null, ambiguous: true });
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
      console.log(
        `${o.ambiguous ? 'PAIR  ' : 'OUTLIER'} ${o.dist}mi | ${o.state}/${o.city} | ${o.name} | zip=${o.zip} | (${o.latitude},${o.longitude})`,
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
      console.log(`  FIXED (${o.dist}mi) | ${o.state}/${o.city} | ${o.name} | (${o.latitude},${o.longitude}) -> (${glat},${glng})`);
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
