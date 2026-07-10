/**
 * GOOGLE PLACES → classify + select proof (head-to-head vs the website/Firecrawl path).
 * For untyped car washes, pull the Google Places gallery + types, then run the vision AI to
 * (1) classify wash type FROM THE PHOTOS and (2) pick the best equipment + facility shots.
 * Places photos are reliably available even when the operator website is dead.
 *
 * Run: node scripts/places-proof.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY, GKEY = env.GOOGLE_PLACES_API_KEY, MODEL = 'claude-opus-4-8';
const MAX_PHOTOS = 8, MIN_BYTES = 9000, PHOTO_W = 1200;

const extJson = s => { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };

async function placeDetails(pid) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(pid)}&fields=photos,types,editorial_summary&key=${GKEY}`;
  const j = await (await fetch(url, { signal: AbortSignal.timeout(12000) })).json();
  if (j.status !== 'OK') return { error: j.status };
  return { photos: (j.result.photos || []).slice(0, MAX_PHOTOS), types: j.result.types || [], editorial: j.result.editorial_summary?.overview || '' };
}

async function fetchPhoto(ref) {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${PHOTO_W}&photo_reference=${encodeURIComponent(ref)}&key=${GKEY}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) }); if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < MIN_BYTES) return null;
    let media = null;
    if (buf.slice(0, 3).toString('hex') === 'ffd8ff') media = 'image/jpeg';
    else if (buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a') media = 'image/png';
    else if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') media = 'image/webp';
    else if (buf.slice(0, 3).toString('ascii') === 'GIF') media = 'image/gif';
    if (!media) return null;
    return { media, data: buf.toString('base64') };
  } catch { return null; }
}

const RUBRIC = `You are a car-wash directory photo editor and classifier. You get candidate images ("Image N") for ONE location. Do TWO jobs.
JOB 1 — pick the best EQUIPMENT-IN-BAY shot and the best FACILITY-CLOSEUP shot; reject junk (a car as the subject, car interiors, distant/street/aerial, gas pumps, store food, logos/graphics, maps, screenshots, blurry, duplicates).
JOB 2 — classify which wash type(s) the location OFFERS (can be multiple): "touchless" (touch-free/laser in-bay automatic, no brushes), "friction_tunnel" (conveyor tunnel or soft-touch with cloth/foam/brushes), "self_serve" (self-service wand bays, coin/credit), "hand_wash" (staff hand-wash), "detailing". Base it on visible equipment/signage; if unclear, lower confidence.
Return ONLY JSON: {"images":[{"index":0,"category":"equipment_bay|facility_closeup|facility_distant|bay_interior|amenity|vehicle|car_interior|street_or_aerial|gas_pump|food_or_store|logo_or_graphic|map_or_screenshot|other","quality":1,"keep":true,"reason":""}],"selection":{"equipment_pick":null,"facility_pick":null,"extras":[],"confidence":0.0,"needs_human":false},"wash_types":{"offers":[],"primary":"","confidence":0.0,"evidence":""}}`;

async function vision(imgs, name) {
  const content = [{ type: 'text', text: `${RUBRIC}\nLocation: ${name}` }];
  imgs.forEach((g, i) => { content.push({ type: 'text', text: `Image ${i}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: g.media, data: g.data } }); });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, thinking: { type: 'disabled' }, messages: [{ role: 'user', content }] }),
  });
  const j = await r.json(); if (!r.ok) return { error: `API ${r.status}` };
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  return { json: extJson(text), usage: j.usage };
}

async function main() {
  const { data: rows } = await sb.from('listings')
    .select('id,name,google_place_id,google_photos_count,review_count')
    .eq('google_category', 'Car wash')
    .not('is_touchless', 'is', true).not('is_self_service', 'is', true)
    .not('google_subtypes', 'ilike', '%self serv%').not('google_subtypes', 'ilike', '%touchless%')
    .not('google_place_id', 'is', null).gt('google_photos_count', 8).gte('review_count', 15)
    .order('review_count', { ascending: false, nullsFirst: false }).limit(10);

  console.log(`Google Places → classify + select on ${rows.length} untyped car washes\n`);
  const report = []; let details = 0, photoCalls = 0, cIn = 0, cOut = 0, classified = 0, gotEquip = 0, gotFacility = 0;

  for (const l of rows) {
    process.stdout.write(`• ${l.name}  (Google has ${l.google_photos_count} photos)\n`);
    const d = await placeDetails(l.google_place_id); details++;
    if (d.error) { console.log(`   details error: ${d.error}`); report.push({ name: l.name, error: d.error }); continue; }
    const imgs = [];
    for (const p of d.photos) { const g = await fetchPhoto(p.photo_reference); photoCalls++; if (g) imgs.push(g); }
    if (!imgs.length) { console.log('   no usable photos'); report.push({ name: l.name, note: 'no photos' }); continue; }
    const v = await vision(imgs, l.name);
    if (v.usage) { cIn += v.usage.input_tokens; cOut += v.usage.output_tokens; }
    const p = v.json || {}; const wt = p.wash_types || {}; const sel = p.selection || {};
    const kept = (p.images || []).filter(i => i.keep).length;
    if ((wt.offers || []).length && (wt.confidence || 0) >= 0.5) classified++;
    if (sel.equipment_pick != null) gotEquip++;
    if (sel.facility_pick != null) gotFacility++;
    console.log(`   TYPE → offers:[${(wt.offers || []).join(',')}] primary:${wt.primary} conf:${wt.confidence}  ("${(wt.evidence || '').slice(0, 90)}")`);
    console.log(`   PHOTOS → ${imgs.length} gallery | kept ${kept} | equip:#${sel.equipment_pick ?? '—'} facility:#${sel.facility_pick ?? '—'} conf:${sel.confidence} needs_human:${sel.needs_human}\n`);
    report.push({ id: l.id, name: l.name, googleTypes: d.types, editorial: d.editorial, washTypes: wt, selection: sel, images: p.images });
  }

  console.log('==================== GOOGLE PLACES PROOF ====================');
  console.log(`Confidently classified from photos: ${classified}/${rows.length}`);
  console.log(`Photo selection: equipment shot in ${gotEquip}/${rows.length}, facility shot in ${gotFacility}/${rows.length}`);
  console.log(`Places API: ${details} detail calls + ${photoCalls} photo fetches  (~$${(details * 0.017 + photoCalls * 0.007).toFixed(2)})`);
  console.log(`Claude: ${cIn.toLocaleString()} in / ${cOut.toLocaleString()} out  (~$${((cIn * 5 + cOut * 25) / 1e6).toFixed(2)} on Opus 4.8)`);
  writeFileSync('scripts/_places_proof_report.json', JSON.stringify(report, null, 2));
  console.log('Full report: scripts/_places_proof_report.json');
}
main();
