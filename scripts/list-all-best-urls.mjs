#!/usr/bin/env node
/**
 * List all /best/[slug] URLs, grouped by region, with listing counts.
 * Only shows metros with 5+ approved touchless listings (the ones that
 * actually render a page — below threshold returns notFound()).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Parse lib/metro-areas.ts
const txt = readFileSync('lib/metro-areas.ts','utf8');
const rx = /name:\s*'([^']+)',\s*displayName:\s*'([^']+)',\s*slug:\s*'([^']+)',\s*lat:\s*([\-0-9.]+),\s*lng:\s*([\-0-9.]+),\s*radiusMiles:\s*(\d+)[^}]*?region:\s*'([^']+)'/g;
const metros = [];
let m;
while ((m = rx.exec(txt))) {
  metros.push({ name: m[1], displayName: m[2], slug: m[3], lat: +m[4], lng: +m[5], r: +m[6], region: m[7] });
}

// Load approved touchless with coords
const listings = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('latitude, longitude')
    .eq('is_touchless', true)
    .eq('is_approved', true)
    .not('latitude','is',null)
    .not('longitude','is',null)
    .range(offset, offset+999);
  if (!data || data.length === 0) break;
  listings.push(...data);
  if (data.length < 1000) break;
}

function dist(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

for (const metro of metros) {
  let count = 0;
  for (const l of listings) {
    if (dist(metro.lat, metro.lng, l.latitude, l.longitude) <= metro.r) count++;
  }
  metro.count = count;
}

const rendered = metros.filter(m => m.count >= 5);
const belowThreshold = metros.filter(m => m.count < 5);

console.log(`==================================================`);
console.log(`ALL /best/[slug] URLS — RENDERED (${rendered.length}/${metros.length})`);
console.log(`==================================================\n`);
console.log(`Hub:`);
console.log(`https://touchlesscarwashfinder.com/best`);
console.log(``);

const regions = ['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West'];
for (const reg of regions) {
  const rows = rendered.filter(m => m.region === reg).sort((a,b) => b.count - a.count);
  if (rows.length === 0) continue;
  console.log(`\n── ${reg} (${rows.length}) ──────────────`);
  for (const m of rows) {
    console.log(`https://touchlesscarwashfinder.com/best/${m.slug}   # ${m.displayName} (${m.count})`);
  }
}

if (belowThreshold.length > 0) {
  console.log(`\n\n==================================================`);
  console.log(`BELOW 5-LISTING THRESHOLD — will return 404 (${belowThreshold.length})`);
  console.log(`==================================================`);
  console.log(`(These are defined in metro-areas.ts but the page will notFound() until they reach 5)\n`);
  for (const m of belowThreshold.sort((a,b) => b.count - a.count)) {
    console.log(`  ${m.displayName.padEnd(30)} count=${m.count} r=${m.r}mi  /best/${m.slug}`);
  }
}

// Raw URL list for easy copy-paste
console.log(`\n\n==================================================`);
console.log(`RAW URL LIST (for GSC submission) — ${rendered.length + 1} URLs`);
console.log(`==================================================\n`);
console.log(`https://touchlesscarwashfinder.com/best`);
for (const m of rendered) {
  console.log(`https://touchlesscarwashfinder.com/best/${m.slug}`);
}
