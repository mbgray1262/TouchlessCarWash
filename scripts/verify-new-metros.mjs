#!/usr/bin/env node
/**
 * Verify each new metro has 5+ approved touchless listings within radius
 * (the /best/[slug] page threshold, below which notFound() is returned).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const NEW_METROS = [
  { slug: 'worcester', name: 'Worcester, MA', lat: 42.2626, lng: -71.8023, r: 15 },
  { slug: 'charlottesville', name: 'Charlottesville, VA', lat: 38.0293, lng: -78.4767, r: 20 },
  { slug: 'kalamazoo', name: 'Kalamazoo, MI', lat: 42.2917, lng: -85.5872, r: 15 },
  { slug: 'springfield-il', name: 'Springfield, IL', lat: 39.7817, lng: -89.6501, r: 20 },
  { slug: 'evansville', name: 'Evansville, IN', lat: 37.9716, lng: -87.5711, r: 20 },
  { slug: 'warren-youngstown', name: 'Warren-Youngstown, OH', lat: 41.2376, lng: -80.8184, r: 20 },
  { slug: 'valparaiso', name: 'Valparaiso, IN', lat: 41.4731, lng: -87.0611, r: 15 },
  { slug: 'janesville', name: 'Janesville, WI', lat: 42.6828, lng: -89.0187, r: 20 },
  { slug: 'waterloo-cedar-falls', name: 'Waterloo, IA', lat: 42.4928, lng: -92.3427, r: 15 },
  { slug: 'cedar-rapids', name: 'Cedar Rapids, IA', lat: 41.9779, lng: -91.6656, r: 20 },
  { slug: 'quad-cities', name: 'Quad Cities, IA-IL', lat: 41.5236, lng: -90.5776, r: 20 },
  { slug: 'fort-collins', name: 'Fort Collins, CO', lat: 40.5853, lng: -105.0844, r: 20 },
  { slug: 'billings', name: 'Billings, MT', lat: 45.7833, lng: -108.5007, r: 20 },
  { slug: 'bend', name: 'Bend, OR', lat: 44.0582, lng: -121.3153, r: 20 },
];

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

console.log(`Verifying ${NEW_METROS.length} new metros against ${listings.length} approved touchless listings:\n`);
let allPass = true;
for (const m of NEW_METROS) {
  let count = 0;
  for (const l of listings) {
    if (dist(m.lat, m.lng, l.latitude, l.longitude) <= m.r) count++;
  }
  const status = count >= 5 ? '✅' : '⚠️ ';
  if (count < 5) allPass = false;
  console.log(`  ${status} ${m.name.padEnd(28)} /best/${m.slug.padEnd(20)} count=${count} r=${m.r}mi`);
}
console.log(allPass ? '\n✅ All metros meet the 5-listing threshold' : '\n⚠️  Some metros below threshold — consider radius bump');
