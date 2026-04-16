#!/usr/bin/env node
/**
 * Propose new metros to add to lib/metro-areas.ts based on current
 * approved-touchless density that is NOT already covered by an existing
 * metro radius.
 *
 * Criteria: cities with 8+ approved touchless listings that sit >30 miles
 * from every existing metro center — i.e. a genuinely new cluster.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Load existing metro areas
const mt = readFileSync('lib/metro-areas.ts','utf8');
const existing = [];
const rx = /name:\s*'([^']+)'[^}]*?slug:\s*'([^']+)',\s*lat:\s*([\-0-9.]+),\s*lng:\s*([\-0-9.]+),\s*radiusMiles:\s*(\d+)/g;
let m;
while ((m = rx.exec(mt))) {
  existing.push({ slug: m[2], name: m[1], lat: +m[3], lng: +m[4], r: +m[5] });
}
console.log(`Existing metros: ${existing.length}`);

// Load all approved touchless with coords
const listings = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('latitude, longitude, city, state, name')
    .eq('is_touchless', true)
    .eq('is_approved', true)
    .not('latitude','is',null)
    .not('longitude','is',null)
    .range(offset, offset+999);
  if (!data || data.length === 0) break;
  listings.push(...data);
  if (data.length < 1000) break;
}
console.log(`Approved touchless with coords: ${listings.length}`);

function dist(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Find listings NOT covered by any existing metro
const uncovered = listings.filter(l => {
  for (const e of existing) {
    if (dist(l.latitude, l.longitude, e.lat, e.lng) <= e.r) return false;
  }
  return true;
});
console.log(`Listings not covered by any existing metro radius: ${uncovered.length}\n`);

// Cluster by city+state (natural grouping)
const byCity = new Map();
for (const l of uncovered) {
  const key = `${l.city}|${l.state}`;
  if (!byCity.has(key)) byCity.set(key, { city: l.city, state: l.state, listings: [] });
  byCity.get(key).listings.push(l);
}

// Compute centroid + count for each city
const clusters = [];
for (const [key, c] of byCity) {
  if (c.listings.length < 5) continue;
  const lat = c.listings.reduce((s,l) => s + l.latitude, 0) / c.listings.length;
  const lng = c.listings.reduce((s,l) => s + l.longitude, 0) / c.listings.length;
  clusters.push({ city: c.city, state: c.state, count: c.listings.length, lat, lng });
}
clusters.sort((a,b) => b.count - a.count);

console.log(`City clusters (>=5 uncovered approved touchless):`);
for (const c of clusters.slice(0, 20)) {
  const slug = `${c.city.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;
  console.log(`  ${c.city.padEnd(28)} ${c.state}  count:${String(c.count).padStart(3)}  centroid:${c.lat.toFixed(3)},${c.lng.toFixed(3)}  → /best/${slug}`);
}

// Also scan for under-sized existing metros that might need radius expansion
console.log(`\nExisting metros with LOW coverage (might need radius expansion):`);
const covered = new Map();
for (const l of listings) {
  for (const e of existing) {
    if (dist(l.latitude, l.longitude, e.lat, e.lng) <= e.r) {
      covered.set(e.slug, (covered.get(e.slug) || 0) + 1);
      break;
    }
  }
}
const underCovered = existing
  .map(e => ({ ...e, count: covered.get(e.slug) || 0 }))
  .filter(e => e.count < 5);
for (const e of underCovered) {
  console.log(`  ${e.name.padEnd(28)} (${e.slug})  count:${e.count}  r:${e.r}mi`);
}
