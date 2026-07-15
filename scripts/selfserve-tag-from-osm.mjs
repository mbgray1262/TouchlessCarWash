/**
 * Tag self-serve listings from OpenStreetMap's explicit `self_service=yes` tag. $0.
 *
 * Michael's find, and the best signal we have. Unlike Google's category (an algorithmic
 * guess that's wrong ~a third of the time — it labels Quick Quack and Tidal Wave "self
 * service car wash") or Yelp (no such category at all), OSM's tag is one a human mapper
 * deliberately set on that specific wash. Overpass is free, unmetered, needs no key.
 *
 * Match is SPATIAL, not by name: OSM names are often short or absent ("Soapy Joe's" vs our
 * "Soapy Joe's Car Wash - Cuyamaca St, Santee"), but the coordinates land on the same slab
 * of concrete — the sample matched at 0–44m.
 *
 * Guards still run first. OSM is user-contributed, so a mapper CAN tag a tunnel wrong; and
 * a wash named "express"/"auto spa"/"tunnel" is almost never self-serve (Michael's rule),
 * unless the name says "self serv" outright. Anything a guard catches is REPORTED, not
 * silently dropped.
 *
 * Tagging is additive and invisible: sets is_self_service only. is_approved is untouched and
 * self_service_reviewed_at stays NULL, so nothing publishes and photo-autopilot still picks
 * these up for hero + wash-type verification.
 *
 *   node scripts/selfserve-tag-from-osm.mjs            # fetch + dry run
 *   node scripts/selfserve-tag-from-osm.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
const CACHE = '/tmp/osm_selfserve.json';

const CHAIN = /\b(tidal wave|whistle express|mister car ?wash|quick quack|tommy'?s express|take 5|zips? car ?wash|club car ?wash|super ?star car ?wash|autobell|el car ?wash|splash ?in|go car ?wash|crew car ?wash|delta sonic|flagstop|rocket car ?wash|caliber car ?wash|jax kar ?wash)\b/i;
const EXCL = /\b(express|auto spa|tunnel)\b/i;
const SELF = /self[\s-]?serv/i;

// ── 1. OSM via Overpass (free, no key) ────────────────────────────────────────────────
let osmRaw;
if (existsSync(CACHE)) { osmRaw = JSON.parse(readFileSync(CACHE, 'utf8')); console.log('using cached Overpass response'); }
else {
  const q = `[out:json][timeout:180];
(
  node["amenity"="car_wash"]["self_service"="yes"](24.5,-125.0,49.4,-66.9);
  way["amenity"="car_wash"]["self_service"="yes"](24.5,-125.0,49.4,-66.9);
);
out center tags;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(200000) });
  if (!r.ok) { console.error('⛔ Overpass failed:', r.status); process.exit(1); }
  osmRaw = await r.json(); writeFileSync(CACHE, JSON.stringify(osmRaw));
}
const osm = osmRaw.elements.map(e => ({ name: e.tags?.name || '', lat: e.center?.lat ?? e.lat, lng: e.center?.lon ?? e.lon }))
  .filter(o => o.lat != null && o.lng != null);
console.log(`OSM self_service=yes points: ${osm.length}`);

// ── 2. Our geocoded listings ──────────────────────────────────────────────────────────
let rows = [];
for (let p = 0; ; p++) {
  const { data, error } = await sb.from('listings').select('id,name,city,state,latitude,longitude,is_self_service,self_service_source')
    .not('latitude', 'is', null).order('id').range(p * 1000, p * 1000 + 999);
  if (error) { console.error('⛔ listings query failed:', error.message); process.exit(1); }  // never read a failure as "none"
  if (!data?.length) break;
  rows.push(...data);
  if (data.length < 1000) break;
}
console.log(`our geocoded listings: ${rows.length}\n`);

// ── 3. Spatial match (bucketed ~1.1km so this is O(n), not 2206×45000) ────────────────
const grid = {}; const key = (la, ln) => `${Math.round(la * 100)}|${Math.round(ln * 100)}`;
for (const l of rows) (grid[key(l.latitude, l.longitude)] ||= []).push(l);
const dist = (a, b, c, d) => { const R = 6371000, r = x => x * Math.PI / 180;
  const x = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x)); };

const tag = [], heldChain = [], heldRule = [], conflicts = [];
let already = 0, noMatch = 0;
const seen = new Set();
for (const o of osm) {
  let best = null, bd = 1e9;
  const ka = Math.round(o.lat * 100), kn = Math.round(o.lng * 100);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
    for (const l of (grid[`${ka + i}|${kn + j}`] || [])) { const d = dist(o.lat, o.lng, l.latitude, l.longitude); if (d < bd) { bd = d; best = l; } }
  if (!best || bd > 120) { noMatch++; continue; }
  if (seen.has(best.id)) continue;            // two OSM points on one listing
  seen.add(best.id);
  if (best.is_self_service === true) { already++; continue; }
  if (best.is_self_service === false) { conflicts.push({ id: best.id, name: best.name, city: best.city, state: best.state, was: best.self_service_source, osm: o.name, m: Math.round(bd) }); continue; }
  const n = best.name || '';
  const rec = { id: best.id, name: n, city: best.city, state: best.state, osm: o.name, m: Math.round(bd) };
  if (CHAIN.test(n)) heldChain.push(rec);
  else if (EXCL.test(n) && !SELF.test(n)) heldRule.push(rec);
  else tag.push(rec);
}

console.log(`matched within 120m .............. ${already + conflicts.length + tag.length + heldChain.length + heldRule.length}`);
console.log(`  already tagged (OSM agrees) .... ${already}`);
console.log(`  ⚠ CONFLICT: we said NOT self-serve ${conflicts.length}`);
console.log(`  − held: tunnel chain ............ ${heldChain.length}`);
console.log(`  − held: express/auto-spa rule ... ${heldRule.length}`);
console.log(`  ✅ TAG ......................... ${tag.length}`);
console.log(`no listing within 120m ........... ${noMatch}`);

if (!APPLY) {
  console.log('\nsample to tag:'); tag.slice(0, 8).forEach(r => console.log(`  • ${r.name} (${r.city}, ${r.state})  ←OSM "${r.osm}" ${r.m}m`));
  if (heldChain.length) { console.log('\nheld (chain):'); heldChain.slice(0, 5).forEach(r => console.log(`  • ${r.name}  ←OSM "${r.osm}"`)); }
  console.log('\nsample conflicts (we said false, OSM says yes):');
  conflicts.slice(0, 8).forEach(r => console.log(`  • ${r.name} (${r.city}, ${r.state}) — we set false via "${r.was}"  ←OSM "${r.osm}" ${r.m}m`));
  console.log('\n(dry run — pass --apply)');
  process.exit(0);
}

const stamp = Date.now();
writeFileSync(`scripts/_backup_osm_tag_${stamp}.json`, JSON.stringify(tag.map(r => ({ ...r, prev_is_self_service: null })), null, 2));
writeFileSync(`scripts/_osm_conflicts_${stamp}.json`, JSON.stringify({ conflicts, heldChain, heldRule }, null, 2));
let ok = 0, bad = 0;
for (const r of tag) {
  const { error } = await sb.from('listings').update({ is_self_service: true, self_service_source: 'osm_self_service' }).eq('id', r.id);
  if (error) { bad++; console.log(`  ⚠ ${r.name}: ${error.message}`); } else ok++;
}
console.log(`\ntagged ${ok}${bad ? ` | FAILED ${bad}` : ''}`);
console.log(`backup: scripts/_backup_osm_tag_${stamp}.json (reversible)`);
console.log(`conflicts + held for review: scripts/_osm_conflicts_${stamp}.json (${conflicts.length + heldChain.length + heldRule.length})`);
