#!/usr/bin/env node
/**
 * For each existing METRO_AREAS metro, compare:
 *   - Total is_touchless listings within radius TODAY
 *   - How many of those were promoted today (classification_source like 'promoted_apr16%')
 *
 * Tells us which /best/[slug] pages got biggest lift from today's work.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Parse metro-areas.ts minimally
const txt = readFileSync('lib/metro-areas.ts','utf8');
const metros = [];
const rx = /name:\s*'([^']+)'[^}]*?slug:\s*'([^']+)',\s*lat:\s*([\-0-9.]+),\s*lng:\s*([\-0-9.]+),\s*radiusMiles:\s*(\d+)/g;
let m;
while ((m = rx.exec(txt))) {
  metros.push({ slug: m[2], name: m[1], lat: +m[3], lng: +m[4], r: +m[5] });
}
console.log(`Loaded ${metros.length} metros\n`);

// Load all touchless listings with coords
const listings = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('id, latitude, longitude, is_approved, classification_source')
    .eq('is_touchless', true)
    .not('latitude','is',null)
    .not('longitude','is',null)
    .range(offset, offset+999);
  if (!data || data.length === 0) break;
  listings.push(...data);
  if (data.length < 1000) break;
}
console.log(`${listings.length} is_touchless listings with coords\n`);

function dist(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const gains = [];
for (const metro of metros) {
  let total = 0, todayNew = 0, approved = 0;
  for (const l of listings) {
    if (dist(metro.lat, metro.lng, l.latitude, l.longitude) <= metro.r) {
      total++;
      if (l.is_approved) approved++;
      if ((l.classification_source || '').includes('promoted_apr16')) todayNew++;
    }
  }
  gains.push({ metro: metro.name, slug: metro.slug, total, approved, todayNew });
}

console.log(`Biggest metro gains from today's work (approved only):`);
gains.sort((a,b) => b.todayNew - a.todayNew);
for (const g of gains.slice(0, 30)) {
  if (g.todayNew === 0) break;
  console.log(`  ${g.metro.slice(0,28).padEnd(28)} approved:${String(g.approved).padStart(4)}  totalT:${String(g.total).padStart(4)}  newToday:${String(g.todayNew).padStart(3)}  /best/${g.slug}`);
}

console.log(`\nMetros now crossing thresholds:`);
const strong = gains.filter(g => g.approved >= 5).length;
const solid = gains.filter(g => g.approved >= 10).length;
const rich  = gains.filter(g => g.approved >= 20).length;
console.log(`  >= 5 approved touchless:  ${strong} metros`);
console.log(`  >= 10 approved touchless: ${solid} metros`);
console.log(`  >= 20 approved touchless: ${rich} metros`);
