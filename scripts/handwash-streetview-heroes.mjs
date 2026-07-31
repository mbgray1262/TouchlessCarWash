/**
 * Street-View fallback hero for hand-wash listings that have NO photos (the bad-import rows
 * with coordinates but no place_id, so the Google-gallery pipeline skipped them). Fetches an
 * aimed Street View at the listing's coordinates (camera pointed at the building), crops 16:9,
 * and sets it as the hero — so the listing isn't blank in the review queue. Michael still
 * approves/swaps in the tool (hand_wash_reviewed_at stays NULL). Street View is FREE.
 *
 *   node scripts/handwash-streetview-heroes.mjs --dry     # counts + sample, no writes
 *   node scripts/handwash-streetview-heroes.mjs --apply   # set street-view heroes
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import crypto from 'node:crypto';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const GKEY = env.GOOGLE_PLACES_API_KEY, SIGN_SECRET = env.GOOGLE_URL_SIGNING_SECRET;
const APPLY = process.argv.includes('--apply');
const MIN_BYTES = 5000;

// --- aimed Street View (same method as selfserve-autophoto / handwash-autophoto) ---
function signGoogleUrl(url) {
  if (!SIGN_SECRET) return url;
  const u = new URL(url);
  const keyBuffer = Buffer.from(SIGN_SECRET.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const sig = crypto.createHmac('sha1', keyBuffer).update(u.pathname + u.search).digest('base64').replace(/\+/g, '-').replace(/\//g, '_');
  return `${url}&signature=${sig}`;
}
function svBearing(from, to) {
  const R = d => (d * Math.PI) / 180, D = r => (r * 180) / Math.PI;
  const y = Math.sin(R(to.lng - from.lng)) * Math.cos(R(to.lat));
  const x = Math.cos(R(from.lat)) * Math.sin(R(to.lat)) - Math.sin(R(from.lat)) * Math.cos(R(to.lat)) * Math.cos(R(to.lng - from.lng));
  return (D(Math.atan2(y, x)) + 360) % 360;
}
async function streetViewImage(lat, lng) {
  if (!GKEY || lat == null || lng == null) return null;
  try {
    const meta = await (await fetch(signGoogleUrl(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&source=outdoor&radius=120&key=${GKEY}`), { signal: AbortSignal.timeout(12000) })).json();
    if (meta.status !== 'OK' || !meta.pano_id) return null;
    const dLat = Math.abs((meta.location?.lat ?? lat) - lat), dLng = Math.abs((meta.location?.lng ?? lng) - lng);
    const heading = (dLat < 1e-5 && dLng < 1e-5) ? 0 : svBearing(meta.location, { lat, lng });
    const r = await fetch(`https://streetviewpixels-pa.googleapis.com/v1/thumbnail?cb_client=maps_sv.tactile&w=2048&h=1152&pitch=0&panoid=${meta.pano_id}&yaw=${heading.toFixed(0)}`, { headers: { Referer: 'https://www.google.com/' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length < MIN_BYTES ? null : { buf, date: meta.date || null };
  } catch { return null; }
}
async function cropHero(buffer) {
  try {
    const m = await sharp(buffer).metadata();
    const AR = 16 / 9; let x = 0, y = 0, w = m.width, h = m.height;
    if (w / h > AR) { const nw = Math.round(h * AR); x = Math.round((w - nw) / 2); w = nw; }
    else { const nh = Math.round(w / AR); y = Math.round((h - nh) / 2); h = nh; }
    return await sharp(buffer).extract({ left: x, top: y, width: w, height: h }).jpeg({ quality: 88 }).toBuffer();
  } catch { return buffer; }
}
async function upload(buffer, id) {
  const path = `${id}/ai-hero-sv-${Date.now()}.jpg`;
  const { error } = await sb.storage.from('listing-photos').upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
  if (error) return null;
  return sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
}

// Targets: unreviewed hand-wash listings with NO hero and valid coordinates.
let targets = [];
for (let from = 0; ; from += 1000) {
  const { data } = await sb.from('listings').select('id,name,city,state,latitude,longitude')
    .eq('is_hand_wash', true).is('hand_wash_reviewed_at', null).is('hero_image', null)
    .not('latitude', 'is', null).order('id').range(from, from + 999);
  if (!data?.length) break;
  targets.push(...data);
  if (data.length < 1000) break;
}
console.log(`${targets.length} blank hand-wash listings with coordinates | ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

let set = 0, noSV = 0, errs = 0;
for (const l of targets) {
  try {
    const sv = await streetViewImage(l.latitude, l.longitude);
    if (!sv) { noSV++; console.log(`  ·  ${(l.name || '').slice(0, 36).padEnd(37)} no Street View at coords`); continue; }
    console.log(`  ✓  ${(l.name || '').slice(0, 36).padEnd(37)} street view${sv.date ? ' (' + sv.date + ')' : ''} → hero`);
    if (APPLY) {
      const url = await upload(await cropHero(sv.buf), l.id);
      if (url) { await sb.from('listings').update({ hero_image: url, hero_image_source: 'street_view_auto' }).eq('id', l.id); set++; }
    } else set++;
  } catch (e) { errs++; console.log(`  ❌ ${(l.name || '').slice(0, 30)}: ${String(e.message || e).slice(0, 50)}`); }
}
console.log(`\nDONE: ${set} street-view heroes ${APPLY ? 'set' : 'would be set'} | ${noSV} no Street View available | ${errs} errors`);
