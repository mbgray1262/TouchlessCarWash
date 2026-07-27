// Re-render permanently-baked low-res Street View heroes at high resolution.
//
// WHY THIS EXISTS: some self-serve heroes are `ap-hero-*.jpg` / `ai-hero-*.jpg`
// files we DOWNLOADED from Google Street View and stored in our own bucket. When
// the photo-autopilot's high-res (2048/1600) re-render failed, it fell back to
// storing the 640-wide SELECTION buffer — cropped to 16:9 that is exactly the
// 640x360 file the admin flags as "Low res". Those pixels are baked in; rewriting
// a URL's width param (the earlier live-thumbnail fix) does NOTHING for a saved
// JPG. The only fix is to RE-FETCH the same Street View pano at 2048x1152 and
// overwrite the stored hero. The heading is recomputed deterministically (bearing
// from pano to the listing's coords) so the framing matches the original.
//
// Cost: ~$0.007 per Street View Static call. Scope is only the genuinely-low-res
// ones (measured < 800px wide), so this is a few dozen calls, well under $1.
//
// Usage:
//   node scripts/fix-lowres-streetview-heroes.mjs            # dry run (measure only)
//   node scripts/fix-lowres-streetview-heroes.mjs --apply    # re-render + save
//   ...optionally add --all to include already-approved self-serve too (default: all self-serve)

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import sharp from 'sharp';
import crypto from 'crypto';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const GKEY = env.GOOGLE_PLACES_API_KEY;
const SIGN_SECRET = env.GOOGLE_URL_SIGNING_SECRET;

const APPLY = process.argv.includes('--apply');
const LOWRES_MAX_W = 800; // heroes narrower than this are the baked-low-res ones

// --- helpers copied verbatim from selfserve-autophoto.mjs (single source of the SV recipe) ---
function signGoogleUrl(url) {
  if (!SIGN_SECRET) return url;
  const u = new URL(url);
  const sig = crypto.createHmac('sha1', Buffer.from(SIGN_SECRET.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))
    .update(u.pathname + u.search).digest('base64').replace(/\+/g, '-').replace(/\//g, '_');
  return `${url}&signature=${sig}`;
}
function svBearing(from, to) {
  const R = d => (d * Math.PI) / 180, D = r => (r * 180) / Math.PI;
  const y = Math.sin(R(to.lng - from.lng)) * Math.cos(R(to.lat));
  const x = Math.cos(R(from.lat)) * Math.sin(R(to.lat)) - Math.sin(R(from.lat)) * Math.cos(R(to.lat)) * Math.cos(R(to.lng - from.lng));
  return (D(Math.atan2(y, x)) + 360) % 360;
}
// Street View at TRUE high-res. The public Static API (maps/api/streetview) is
// hard-capped at 640px on our billing tier even when signed — verified. The
// UNDOCUMENTED tiles endpoint that maps.google.com itself uses
// (streetviewpixels-pa) serves the pano at its native resolution (~1024-2048px
// depending on the pano). We get the pano_id + a building-aimed heading from the
// (free, signed) metadata call, then pull the big thumbnail from streetviewpixels.
async function streetViewImage(lat, lng) {
  try {
    const meta = await (await fetch(signGoogleUrl(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&source=outdoor&radius=120&key=${GKEY}`), { signal: AbortSignal.timeout(12000) })).json();
    if (meta.status !== 'OK' || !meta.pano_id) return null;
    const dLat = Math.abs((meta.location?.lat ?? lat) - lat), dLng = Math.abs((meta.location?.lng ?? lng) - lng);
    const heading = (dLat < 1e-5 && dLng < 1e-5) ? 0 : svBearing(meta.location, { lat, lng });
    const url = `https://streetviewpixels-pa.googleapis.com/v1/thumbnail?cb_client=maps_sv.tactile&w=2048&h=1152&pitch=0&panoid=${meta.pano_id}&yaw=${heading.toFixed(0)}`;
    const r = await fetch(url, { headers: { Referer: 'https://www.google.com/' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length < 5000 ? null : buf;
  } catch { return null; }
}
async function cropHero(buffer) {
  try {
    const m = await sharp(buffer).metadata();
    let x = 0, y = 0, w = m.width, h = m.height;
    const AR = 16 / 9;
    if (w / h > AR) { const nw = Math.round(h * AR); x += Math.round((w - nw) / 2); w = nw; }
    else { const nh = Math.round(w / AR); y += Math.round((h - nh) / 2); h = nh; }
    return await sharp(buffer).extract({ left: x, top: y, width: Math.max(16, w), height: Math.max(9, h) }).jpeg({ quality: 88 }).toBuffer();
  } catch { return buffer; }
}
async function upload(buffer, listingId) {
  const path = `${listingId}/ai-hero-${Date.now()}.jpg`;
  const { error } = await sb.storage.from('listing-photos').upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
  if (error) { console.log('   upload error:', error.message); return null; }
  return sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
}
async function measure(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const m = await sharp(Buffer.from(await r.arrayBuffer())).metadata();
    return { w: m.width, h: m.height };
  } catch { return null; }
}

// --- main ---
const includeApproved = true; // default: sweep all self-serve; the low-res filter keeps scope small
let q = sb.from('listings')
  .select('id,name,city,state,hero_image,hero_image_source,latitude,longitude,is_approved')
  .eq('is_self_service', true)
  .or('hero_image.like.%ap-hero%,hero_image.like.%ai-hero%')
  .order('id', { ascending: true });
if (!includeApproved) q = q.eq('is_approved', false);
const { data: rows, error } = await q.limit(2000);
if (error) { console.error(error); process.exit(1); }
console.log(`Scanning ${rows.length} self-serve listings with baked (ap/ai-hero) heroes...\n`);

let lowres = 0, fixed = 0, noPano = 0, noCoords = 0, measErr = 0, skipped = 0, noBetter = 0;
for (const l of rows) {
  const dim = await measure(l.hero_image);
  if (!dim) { measErr++; continue; }
  if (dim.w >= LOWRES_MAX_W) { skipped++; continue; }
  lowres++;
  const tag = l.is_approved ? 'LIVE' : 'unpub';
  console.log(`⚠ ${l.name} (${l.city}, ${l.state}) [${tag}] — ${dim.w}x${dim.h}`);
  if (!l.latitude || !l.longitude) { console.log('   ✗ no coordinates — cannot re-render'); noCoords++; continue; }
  if (!APPLY) continue;
  const buf = await streetViewImage(l.latitude, l.longitude);
  if (!buf) { console.log('   ✗ no Street View pano available at these coords'); noPano++; continue; }
  const rawDim = await sharp(buf).metadata();
  // Only overwrite if the fresh pull is genuinely bigger than what we have — never
  // trade a low-res file for an equally-low-res one (Google caps some panos at 640).
  if (rawDim.width <= dim.w) { console.log(`   – pano only ${rawDim.width}px wide (no better than current ${dim.w}) — left as-is`); noBetter++; continue; }
  const cropped = await cropHero(buf);
  const newDim = await sharp(cropped).metadata();
  const url = await upload(cropped, l.id);
  if (!url) continue;
  await sb.from('listings').update({
    hero_image: url,
    hero_image_source: 'street_view_auto',
    hero_is_low_res: newDim.width < 800 ? null : false,
  }).eq('id', l.id);
  console.log(`   ✓ re-rendered → ${newDim.width}x${newDim.height}`);
  fixed++;
  await new Promise(r => setTimeout(r, 400)); // gentle on Google + Micro DB
}

console.log(`\n── Summary ──`);
console.log(`low-res found: ${lowres}  (measure errors: ${measErr}, ok/skipped: ${skipped})`);
if (APPLY) console.log(`re-rendered high-res: ${fixed}  |  no-better pano (left as-is): ${noBetter}  |  no pano: ${noPano}  |  no coords: ${noCoords}`);
else console.log(`(dry run — re-run with --apply to re-render the ${lowres} low-res heroes)`);
