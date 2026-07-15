/**
 * AUTONOMOUS self-serve photo selection. For each unreviewed confirmed self-serve
 * listing in a state: fetch its Google photos, have a STRONG vision model pick the
 * best hero + up to 3 gallery shots (wash-type aware, strict quality rules), and
 * apply them — OR flag needs_human when it can't do a great job (so you only touch
 * the hard cases). Loads all fetched photos onto the listing so the tool shows them
 * as candidates (no more screenshotting). Does NOT set self_service_reviewed_at —
 * you still glance + approve in the tool; this just removes the manual selection.
 *
 * Usage: node scripts/selfserve-autophoto.mjs CA 12 --apply
 *        node scripts/selfserve-autophoto.mjs CA          (dry run, prints picks)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import crypto from 'node:crypto';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const AKEY = env.ANTHROPIC_API_KEY, GKEY = env.GOOGLE_PLACES_API_KEY, SKEY = env.SERPAPI_KEY, SIGN_SECRET = env.GOOGLE_URL_SIGNING_SECRET;
const MODEL = 'claude-sonnet-5'; // tasteful enough for the FINAL hero/gallery selection
// TRIAGE_MODEL scores each photo 0-5 (the high-volume call). Defaults to Sonnet; set
// TRIAGE_MODEL=claude-haiku-4-5 to run the cheap-triage experiment (Haiku scores,
// Sonnet still makes the final pick). Cost is tracked per-model below.
const TRIAGE_MODEL = process.env.TRIAGE_MODEL || MODEL;
const STATE = (process.argv[2] || 'CA').toUpperCase();
const LIMIT = parseInt(process.argv[3] || '12', 10);
const APPLY = process.argv.includes('--apply');
// How many listings to process at once. The whole thing is I/O-bound (waiting on
// SerpAPI + the vision API), so running a few in parallel is a ~CONCURRENCY× speedup.
// Each listing makes at most one vision call at a time ⇒ ~CONCURRENCY concurrent API
// calls. Override with CONCURRENCY=6 etc. Lower it if you ever hit rate limits.
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '4', 10);
// MAX_PHOTOS is a high safety ceiling, not a real cap — virtually no wash has this
// many photos, and pagination fetches every page up to MAX_PAGES first.
const MAX_PHOTOS = 90, MAX_PAGES = 10, PHOTO_W = 1600, VISION_W = 640, MIN_BYTES = 5000, PROMOTE_CONF = 0.5, MIN_HERO_SCORE = 3, GALLERY_MAX = 6;
let serpCalls = 0;
const INCLUDE_MIXED = !process.argv.includes('--self-only'); // process mixed listings too (facility-both hero), backed up
const MIXED_ONLY = process.argv.includes('--mixed-only'); // ONLY mixed (also-touchless) listings — the careful facility pass
const SKIP_DONE = process.argv.includes('--skip-done'); // skip listings already given a good ai_photo hero (fix only the un-done ones)
const NEEDS_HUMAN_ONLY = process.argv.includes('--needs-human'); // ONLY re-process currently-flagged (autophoto_needs_human) listings
const NAME_FILTER = process.argv.slice(4).find(a => !a.startsWith('--')); // optional name ILIKE for targeted runs
const MOBILE = /\b(m[oó]vil|mobile|a\s?domicilio|domicilio|at\s?home|to\s?your)\b/i; // mobile washes = no fixed self-serve facility

function rubric(mixed) {
  return `You are a skilled photo editor curating images for a self-service car wash directory.

This location is: ${mixed ? 'MIXED — it is ALSO a touchless/automatic wash. Self-serve seekers view this page, so the imagery MUST clearly show the self-serve side, never only the automatic bay.' : 'SELF-SERVE ONLY.'}

WHAT A SELF-SERVE WASH BAY IS (read VERY carefully): a COVERED STALL that a VEHICLE — a car, truck, van, SUV, BOAT, RV, trailer, or motorcycle — is driven/pulled INTO to be washed by hand. It may be ENCLOSED, 3-SIDED, or an OPEN-canopy drive-through bay; it may be a LARGE/TALL drive-in bay (for trucks/RVs, sometimes marked "CLEARANCE 12'"). It has side WALLS/pillars separating each bay and a hanging spray WAND/lance mounted on the wall, usually with a coin/pay box + foam brush. KEY DISCRIMINATOR vs a vacuum area: a WASH bay is a DEEP covered stall a vehicle is driven fully INTO (a bay opening you can see through, with side walls); a VACUUM area is a SHALLOW shade canopy over OPEN parking that you park BESIDE. Judge by the STRUCTURE (deep drive-in stall) — do NOT require the wand to be clearly visible in the photo; the wand is often out of frame, in shadow, or coiled on the wall. ANY vehicle inside such a covered drive-in stall IS a valid self-serve wash bay shot. A facility/exterior photo OR a Street View that shows a ROW OF THESE COVERED BAY OPENINGS (the arched/rectangular drive-through openings in the building) ALSO counts as has_self_serve_bay=true — that row-of-bays exterior is often the clearest evidence. IMPORTANT: a vacuum area in the SAME photo or facility does NOT disqualify it — if wash bays (covered drive-in stalls) are present ANYWHERE in the set, set has_self_serve_bay=true (the vacuum shots are just skipped for hero/gallery).

CRITICAL — a self-serve VACUUM area is NOT a wash bay; it is IRRELEVANT and must NEVER be hero or gallery (this is a common mistake — do not make it):
  - It is an OPEN lot with NO side walls between cars — cars park out in the open beside upright VACUUM CANISTERS / cylinders (often colored blue or red) mounted on posts or arched metal frames, sometimes under a light canopy.
  - Those are VACUUM/shampoo canisters with thick suction hoses — NOT wash stalls, NOT spray wands.
  - A ROW of canister-on-post stations over open parking = a VACUUM area. Customers use it themselves, but it is NOT a self-serve WASH bay. DISQUALIFY every such photo (category = "vacuum").
  Also NOT wash bays: automatic/touchless in-bay washes, tunnel washes, hand-wash/detail areas.

STEP 0 — VERIFY FIRST: does AT LEAST ONE photo (INCLUDING the Street View, if provided) show a genuine self-serve WASH BAY — a covered drive-in stall (enclosed, 3-sided, open-canopy, or a large "clearance" bay), a vehicle inside such a stall, OR a facility/Street-View exterior showing a ROW of covered bay OPENINGS in the building? Judge by structure, not by a visible wand. A vacuum area in the SAME set does NOT count against it — if ANY covered wash bay is present, set has_self_serve_bay=true. Only set has_self_serve_bay=false if the ENTIRE set (photos + Street View) shows NO covered wash bay at all — i.e. it's purely a vacuum lot with no bays, purely open-lot parking, an automatic/tunnel-only wash, or just signage. When false, set hero_index=null, gallery_indices=[] and STOP.

STEP 1 — (only if has_self_serve_bay) Score EVERY image (skip none). For each: category, self_serve_relevance (0-5), visual_quality (0-5), hero_worthy (0-5), disqualified (bool) + reason.

STEP 2 — Pick the HERO: the single most ATTRACTIVE and INFORMATIVE image — one that both looks genuinely nice to a typical visitor AND clearly shows what this self-serve wash looks like. Make a BALANCED, tasteful judgment; do NOT mechanically prefer one type. A great hero can be ANY of these — pick whichever is actually the nicest of THIS set:
  - a beautifully-lit facility/exterior clearly showing the open self-serve bays (warm golden light or bright even light) — these are OFTEN the best heroes
  - a clean car in a bright, well-lit self-serve bay
  - a clear, well-composed wide shot of the bays
  IF THIS IS A MIXED facility (also touchless/automatic): strongly prefer a WIDE FACILITY/exterior shot that shows BOTH the self-serve bays AND the touchless/automatic bay together, so a visitor looking for EITHER type sees themselves in it. NEVER use a close-up of only the touchless/automatic bay as the hero.
  REWARD: good natural light, clean composition, a clear read of the self-serve bays, sharpness, an inviting feel. PENALIZE: dark/harsh/blown-out light, awkward angles that hide the bays, clutter, or a frame dominated by a single car with little context. Between two decent options, choose the one a typical person would find more attractive.
  Always pick the best available; set hero_index null / needs_human true ONLY if nothing usably shows the self-serve wash.
  Also return hero_crop: fractions (0 to 0.4) to TRIM from each edge of the hero to isolate the main subject (the bays/facility) and remove distracting elements at the edges — e.g. a fence, an adjacent building, a pole, a parked car off to the side, or empty sky/pavement. Use 0 for edges that are already clean; keep the bays fully in frame and do NOT over-crop. The image is later center-cropped to 16:9 within whatever remains.

STEP 3 — Pick GALLERY images (up to ${GALLERY_MAX}): genuine, attractive self-serve SCENES. PRIORITIZE great IN-BAY ACTION shots — a whole VEHICLE inside a recognizable BAY being washed, covered in soap/foam, or rinsed with the wand — these are the most engaging. The vehicle AND the bay must be clearly recognizable; NEVER an extreme close-up of only soap/foam/water/suds on a car's paint, glass, or windshield (an abstract texture shot with no bay or full vehicle is confusing and non-informative — DISQUALIFY it). EQUALLY STRONG (do NOT rank below a car-in-bay shot): a CLEAN, EMPTY self-serve BAY that clearly shows the equipment — the hanging spray WAND/lance, foam brush, coin/pay box, and the walled stall. A well-lit empty bay with clear self-serve equipment is just as valuable and informative as a bay with a car in it; score its visual_quality on its own merits and INCLUDE it — never skip or under-score it just because no vehicle is present. Also good: an appealing wand-in-use shot, a bright wide facility. LEAN TOWARD INCLUDING more good shots, not fewer — a rich gallery of several DIFFERENT vehicles being washed in bays is exactly what we want and is highly engaging. Two shots of DIFFERENT vehicles, or the SAME bay type from a different angle/lighting, or different bays, are DISTINCT — KEEP them all. "Near-identical" (the only thing to collapse) means the SAME vehicle from essentially the same angle, or two nearly-interchangeable exterior/building/sign shots — in that narrow case keep the single best. Do NOT treat "another car in another bay" as a duplicate; those are the best content on the page. Favor a spread across subjects too (bay-in-use, empty equipped bay, wide facility, entrance), but never DROP a genuinely good distinct in-bay shot just to force variety. Include AS MANY genuinely good, DISTINCT shots as exist (up to ${GALLERY_MAX}) — more good images = more engagement — only avoid true look-alikes and weak/useless filler.
  DIVERSITY IS REQUIRED (Michael keeps seeing near-identical galleries): the final gallery must be VISUALLY VARIED — treat it as a curated set, not a dump. NO TWO gallery images may show the SAME vehicle or the SAME composition. If several candidates are of the same car (even at a slightly different distance, angle, or moment) OR are near-interchangeable views of the same facade/entrance/sign, pick ONLY the single best of that group and drop the rest. Before finalizing gallery_indices, scan your picks and remove any that are visually redundant with another pick. Aim for every gallery image to have a DIFFERENT primary subject (e.g. one car-in-bay, a DIFFERENT car-in-bay, an empty equipped bay, a wide facility, an entrance) — a smaller set of distinct shots beats a larger set with look-alikes. Still keep genuinely different vehicles/bays/angles; only collapse the actually-redundant ones.

NEVER pick as hero OR gallery:
  - ANY brush, cloth strip, mitter curtain, foam-pad, or abrasive contact equipment — STRICTLY forbidden (violates our paint-safety brand), even if otherwise nice.
  - Messy/cluttered: towels on cars, cars blocking the bays, tangled hoses in the foreground, junk in frame.
  - For a MIXED site: an automatic/touchless in-bay or tunnel shot as the hero; never let automatic-only be the only imagery.
  - A customer's car with no bay/facility context; car interiors/dashboards; gas pumps; maps; screenshots; food/drinks; people portraits; blurry, very dark, low-res, watermarked, or stock.
  - STRANGE/AMATEUR ANGLES — DISQUALIFY: a photo shot at a tilted/crooked/dutch angle (horizon not level), a weird low or worm's-eye angle, or an EXTREME CLOSE-UP of a single car's body panel, fender, wheel/rim, hood, headlight, or windshield/decal where the wash bay is NOT clearly visible. These look amateurish and don't show the wash. The HERO especially must be LEVEL, well-framed, and clearly read as a self-serve wash bay/facility — never an off-kilter fragment of one car.
  - ANY VACUUM or add-on-vending shot — ABSOLUTELY FORBIDDEN as hero AND gallery, no exceptions. This includes: vacuum canisters/cylinders, vacuum hoses (the thick corrugated/ribbed tubes, often blue), vacuum nozzles/wands, air/fragrance/shampoo/"Fragramatics" or other coin-op vending machines, and their pay stations — WHETHER OR NOT a person is using them, and even if a machine or hose is only PART of the frame's subject. Vacuum shots are completely useless to a WASH directory. If a photo's main subject is vacuum/vending equipment or a vacuum hose, DISQUALIFY it.
  - EXTREME CLOSE-UPS of soap/foam/suds/water on a car's paint, glass, or windshield with no visible bay or full vehicle — abstract texture/surface shots. They are confusing and non-informative. Never hero or gallery.
  - ANY graphic / flyer / poster / event or promotional announcement / text-overlay marketing image — e.g. a "pop-up market" flyer, a food-vendor ad, an event poster, a coupon — ESPECIALLY one advertising anything OTHER than THIS car wash. Hero and gallery images must be real PHOTOGRAPHS of the wash facility/bays, never a graphic, flyer, or logo. (Only a plain photo of the wash's OWN name sign is acceptable, and only as a last-resort hero — never gallery.)

NEVER pick as GALLERY (these are fine to note but are useless filler — reject them from the gallery): a shot whose only value is the building name/sign on a wall; a close-up of a payment/coin/token machine; a bare vacuum canister or a lone hose/tube; truly empty pavement with NO bay walls or equipment in frame. (These may still be acceptable as a last-resort HERO only if truly nothing better exists — but never as gallery.) NOTE: an empty WASH BAY that shows the walled stall + spray wand/foam brush/coin box is NOT "empty pavement" and NOT filler — it is a strong gallery image (see STEP 3).

Return ONLY JSON:
{"has_self_serve_bay":true,"images":[{"index":0,"category":"...","self_serve_relevance":4,"visual_quality":4,"hero_worthy":5,"disqualified":false,"reason":"..."}],"hero_index":2,"hero_crop":{"trim_left":0,"trim_right":0.2,"trim_top":0.1,"trim_bottom":0},"gallery_indices":[4,1],"confidence":0.86,"needs_human":false,"reason":"why these are the best of the set"}`;
}

// Photos come from the FREE headless-browser scrape (scripts/maps-photos-scrape.py),
// cached to _maps_photos_cache.json keyed by place_id. SerpAPI was retired once its
// monthly quota was exhausted — the scrape needs no quota/subscription. The cache holds
// BASE lh3 URLs (size-suffix stripped); append =w1600 so downloadUrl fetches a usable
// resolution. Run the scraper for a state BEFORE autophoto so its cache is populated.
let _mapsCache = null;
function loadMapsCache() {
  if (_mapsCache) return _mapsCache;
  try { _mapsCache = JSON.parse(readFileSync('scripts/_maps_photos_cache.json', 'utf8')); }
  catch { _mapsCache = {}; }
  return _mapsCache;
}
async function serpPhotoUrls(placeId) {
  const urls = loadMapsCache()[placeId] || [];
  serpCalls++; // now "cache lookups" — kept for the summary line
  return urls.map((u) => (u.includes('=') ? u : `${u}=w1600`)).slice(0, MAX_PHOTOS);
}
// Street View fallback (Michael's rule): when a wash has NO usable Google photos,
// grab a signed Street View Static image at its coordinates and use it as the hero.
function signGoogleUrl(url) {
  if (!SIGN_SECRET) return url;
  const u = new URL(url);
  const keyBuffer = Buffer.from(SIGN_SECRET.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const sig = crypto.createHmac('sha1', keyBuffer).update(u.pathname + u.search).digest('base64').replace(/\+/g, '-').replace(/\//g, '_');
  return `${url}&signature=${sig}`;
}
// Bearing FROM the pano TO the business, so the camera is aimed at the building.
function svBearing(from, to) {
  const R = (d) => (d * Math.PI) / 180, D = (r) => (r * 180) / Math.PI;
  const y = Math.sin(R(to.lng - from.lng)) * Math.cos(R(to.lat));
  const x = Math.cos(R(from.lat)) * Math.sin(R(to.lat)) - Math.sin(R(from.lat)) * Math.cos(R(to.lat)) * Math.cos(R(to.lng - from.lng));
  return (D(Math.atan2(y, x)) + 360) % 360;
}
// Street View fallback hero. TWO fixes (Michael's idea — "can't we use the street view
// photo and its date to determine the current business?"):
//  1. source=outdoor — the default returns the NEAREST pano, which is often a stale
//     user photosphere sitting on the business (10380 N 59th Ave: a 2017 "© Keith Pond"
//     sphere shadowed Google's real 2025-01 car imagery). Outdoor = official, current.
//  2. Aim the camera. The old fixed heading=0 pointed NORTH regardless of where the wash
//     was — that's what made Laporte's hero a backyard. Now the heading is the bearing
//     from the pano to the listing's coords, so the building is in frame.
// The metadata call is FREE and also returns `date`, which we log as the hero's vintage.
async function streetViewImage(lat, lng) {
  try {
    const meta = await (await fetch(signGoogleUrl(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&source=outdoor&radius=120&key=${GKEY}`), { signal: AbortSignal.timeout(12000) })).json();
    if (meta.status !== 'OK' || !meta.pano_id) return null; // no official imagery here
    // If the pano sits essentially on top of the business, a bearing is meaningless — keep 0.
    const dLat = Math.abs((meta.location?.lat ?? lat) - lat), dLng = Math.abs((meta.location?.lng ?? lng) - lng);
    const heading = (dLat < 1e-5 && dLng < 1e-5) ? 0 : svBearing(meta.location, { lat, lng });
    const r = await fetch(signGoogleUrl(`https://maps.googleapis.com/maps/api/streetview?size=2048x1152&pano=${meta.pano_id}&fov=90&heading=${heading.toFixed(0)}&pitch=0&key=${GKEY}`), { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length < MIN_BYTES ? null : buf;
  } catch { return null; }
}
// Fetch any image URL as-is (used to vision-verify an existing hero).
async function fetchImage(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length < MIN_BYTES ? null : buf;
  } catch { return null; }
}
// Download a googleusercontent photo at w1600 for SELECTION (vision + triage). Cheap and
// fast; only the winning hero + gallery picks are later re-fetched at full res for
// storage (see hiResBuffer). srcUrl (the size-stripped base) is kept for that re-fetch.
// Only the free-scraper's googleusercontent gps-cs/geougc URLs support dynamic sizing
// (=w1600 / =s0). The authoritative Places-API photo source (retired scraper — see memory
// project_scraper_photo_contamination) yields place-photos URLs that are PRE-SIZED by the
// edge fn (size=1600) and 404 on a size suffix, so those must be fetched as-is.
const RESIZABLE = (u) => /googleusercontent\.com\/(?:gps-cs|geougc)/.test(u || '');
async function downloadUrl(url) {
  try {
    const base = url.split('=')[0];
    const fetchUrl = RESIZABLE(url) ? base + '=w1600' : url;
    const r = await fetch(fetchUrl, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < MIN_BYTES || buf.length > 8_000_000) return null;
    return { buffer: buf, mediaType: ct, srcUrl: RESIZABLE(url) ? base : url };
  } catch { return null; }
}
// Re-fetch a CHOSEN candidate at full resolution for final crop/storage. Google serves
// the same photo far larger than the w1600 selection copy (=s0 returns the original,
// often 3000-4000px), so a cropped hero stays crisp instead of being a shrunk slice of a
// 1600px image. Cap the longest edge at 2560 to keep files reasonable. Falls back to the
// already-downloaded selection buffer on any failure or when there's no source URL
// (street-view / existing-hero buffers, which are already full-res).
async function hiResBuffer(img) {
  // Places / hosted URLs are already at their fetched (1600px) size — the selection buffer
  // IS the final image; only resizable scraper URLs can be re-fetched larger via =s0.
  if (!img || !img.srcUrl || !RESIZABLE(img.srcUrl)) return img?.buffer;
  try {
    const r = await fetch(img.srcUrl + '=s0', { signal: AbortSignal.timeout(20000), redirect: 'follow' });
    if (!r.ok) return img.buffer;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < MIN_BYTES || buf.length > 25_000_000) return img.buffer;
    return await sharp(buf).resize(2560, 2560, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  } catch { return img.buffer; }
}
// A smaller JPEG copy for the vision API (keeps token cost low; the stored image
// stays full-resolution).
async function visionCopy(buffer, mediaType) {
  try { return { mediaType: 'image/jpeg', base64: (await sharp(buffer).resize(VISION_W, null, { withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()).toString('base64') }; }
  catch { return { mediaType, base64: buffer.toString('base64') }; }
}
async function upload(buffer, ct, listingId, slot) {
  const path = `${listingId}/ai-${slot}-${Date.now()}.${ct.split('/')[1].replace('jpeg', 'jpg')}`;
  const { error } = await sb.storage.from('listing-photos').upload(path, buffer, { contentType: ct, upsert: true });
  if (error) return null;
  return sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
}
// Hero crop from the FULL-RES buffer: first trim distracting edges (fractions the
// AI suggests — e.g. a fence on the right), then center-crop the remainder to 16:9.
// Gallery images keep their natural orientation. Falls back on any error.
async function cropHero(buffer, crop = {}) {
  try {
    const clamp = v => Math.min(Math.max(Number(v) || 0, 0), 0.4);
    const tl = clamp(crop.trim_left), tr = clamp(crop.trim_right), tt = clamp(crop.trim_top), tb = clamp(crop.trim_bottom);
    const m = await sharp(buffer).metadata();
    let x = Math.round(m.width * tl), y = Math.round(m.height * tt);
    let w = Math.round(m.width * (1 - tl - tr)), h = Math.round(m.height * (1 - tt - tb));
    const AR = 16 / 9; // then 16:9 center-crop within the trimmed region
    if (w / h > AR) { const nw = Math.round(h * AR); x += Math.round((w - nw) / 2); w = nw; }
    else { const nh = Math.round(w / AR); y += Math.round((h - nh) / 2); h = nh; }
    return await sharp(buffer).extract({ left: x, top: y, width: Math.max(16, w), height: Math.max(9, h) }).jpeg({ quality: 88 }).toBuffer();
  } catch { return buffer; }
}
const xj = s => { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b < 0) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };

// Perceptual (difference) hash — resolution/compression-independent, so the SAME
// underlying Google photo stored as two different files (an old google-*/upload-* and a
// fresh ai-* download) hashes to (near) the same value even though the URLs differ. Used
// to keep visual duplicates out of the merged gallery. Returns a 64-bit BigInt.
async function phash(buffer) {
  const W = 9, H = 8;
  const px = await sharp(buffer).grayscale().resize(W, H, { fit: 'fill' }).raw().toBuffer();
  let hash = 0n, bit = 0n;
  for (let r = 0; r < H; r++) for (let c = 0; c < W - 1; c++) { const i = r * W + c; if (px[i] < px[i + 1]) hash |= (1n << bit); bit++; }
  return hash;
}
// Are two hashes within `thr` bits (Hamming distance)? Same-image-different-encoding is
// typically 0-4; genuinely different photos are >10. Threshold 5 is a safe cutoff.
const hamLE = (a, b, thr) => { let x = a ^ b, d = 0; while (x) { d += Number(x & 1n); x >>= 1n; if (d > thr) return false; } return true; };

async function selectPhotos(name, mixed, imgs) {
  const content = [{ type: 'text', text: `${rubric(mixed)}\n\nLocation: ${name}\nCandidates:` }];
  imgs.forEach((g, i) => { content.push({ type: 'text', text: `Image ${i}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: g.mediaType, data: g.base64 } }); });
  const body = JSON.stringify({ model: MODEL, max_tokens: 12000, messages: [{ role: 'user', content }] });
  // Large galleries (60-80+ images) make a big, slow request — retry with a long timeout.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(300000) });
      if (!res.ok) { if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 4000)); continue; } return { err: `${res.status}: ${(await res.text()).slice(0, 160)}` }; }
      const j = await res.json();
      return { parsed: xj((j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')), usage: j.usage };
    } catch (e) { if (attempt < 2) { await new Promise(r => setTimeout(r, 4000)); continue; } return { err: e?.message || 'fetch failed' }; }
  }
  return { err: 'exhausted retries' };
}

// TRIAGE: score every image cheaply (no hero/gallery decision) so we can look at
// EVERY photo even when a gallery has 60-80 (too many for one final request).
async function triageBatch(mixed, visionImgs) {
  const prompt = `Score each candidate photo for a SELF-SERVICE car wash directory (site is ${mixed ? 'MIXED (also automatic/touchless)' : 'self-serve only'}). A self-serve WASH BAY = a COVERED drive-in STALL a vehicle is pulled into (enclosed, 3-sided, open-canopy, or a large "clearance" bay), typically with a spray WAND on the wall — but judge by the deep drive-in STRUCTURE, not by a visible wand. A facility/Street-View exterior showing a ROW of covered bay OPENINGS also depicts wash bays. For EACH image return its index and score 0-5 (5 = a beautiful, clear self-serve WASH BAY, a row of covered stalls, or a clean facility exterior showing the bay openings; 0 = irrelevant/junk). An EMPTY bay that clearly shows the equipment (spray wand/lance, foam brush, coin box, walled stall) scores JUST AS HIGH as a bay with a vehicle — do not penalize it for having no car. Mark disqualified=true for: any brush/abrasive equipment; automatic/tunnel-only; a self-serve VACUUM area (upright canisters/cylinders on posts or arched frames in an OPEN lot with no walled stalls — NOT a wash bay); ANY shot whose subject is vacuum/vending equipment — vacuum canisters, vacuum hoses (thick corrugated tubes, often blue), vacuum nozzles, air/fragrance/shampoo/"Fragramatics" or other coin-op vending machines and their pay stations — even if a person is using them or it is only part of the frame (ALWAYS disqualified); messy/blocked bays; close-ups of coin/sign/machine; a car with no bay context; car interiors; gas; food; maps; any graphic/flyer/poster/event-or-promo announcement/logo/coupon (especially advertising something other than this wash); extreme close-ups of soap/foam/water on paint/glass with no bay or full vehicle (abstract texture shots); a TILTED/crooked/dutch-angle shot (horizon not level) or an EXTREME CLOSE-UP of one car's body panel, fender, wheel/rim, hood, headlight, or windshield/decal where the bay is not clearly visible (amateur-angle fragments — score 0-1); blurry/dark. Return ONLY JSON: {"scores":[{"index":0,"score":4,"disqualified":false}]}`;
  const content = [{ type: 'text', text: prompt }];
  visionImgs.forEach((g, i) => { content.push({ type: 'text', text: `Image ${i}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: g.mediaType, data: g.base64 } }); });
  const body = JSON.stringify({ model: TRIAGE_MODEL, max_tokens: 4000, messages: [{ role: 'user', content }] });
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(180000) });
      if (!res.ok) { if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 4000)); continue; } return { err: res.status }; }
      const j = await res.json();
      return { parsed: xj((j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')), usage: j.usage };
    } catch { if (a < 2) { await new Promise(r => setTimeout(r, 4000)); continue; } return { err: 'fetch failed' }; }
  }
  return { err: 'retries' };
}

// For a MIXED facility: does the CURRENT hero already show the self-serve side? If
// yes we KEEP the curated hero (don't rescreen a good pick) and only enrich the
// gallery. If it shows ONLY automatic/touchless equipment (or no bay), the mixed pass
// replaces it with a self-serve/both-bays hero. Michael's refined rule 2026-07-12.
async function assessHeroSelfServe(buffer) {
  const vis = await visionCopy(buffer, 'image/jpeg');
  if (!vis) return null;
  const prompt = `This is the CURRENT hero image for a car wash that offers BOTH self-service AND automatic/touchless washing. Does THIS image clearly show the SELF-SERVICE side — a walled self-serve wash BAY/stall with a hanging spray wand, a row of such walled stalls, or a vehicle being washed inside one? An image showing ONLY an automatic/tunnel bay, laser/gantry equipment, or just the building/sign/lot with no visible self-serve bay does NOT count. Return ONLY JSON: {"shows_selfserve":true,"note":"..."}`;
  const content = [{ type: 'text', text: prompt }, { type: 'image', source: { type: 'base64', media_type: vis.mediaType, data: vis.base64 } }];
  const body = JSON.stringify({ model: MODEL, max_tokens: 300, messages: [{ role: 'user', content }] });
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(60000) });
      if (!res.ok) { if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 4000)); continue; } return null; }
      const j = await res.json();
      return { parsed: xj((j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')), usage: j.usage };
    } catch { if (a < 2) { await new Promise(r => setTimeout(r, 4000)); continue; } return null; }
  }
  return null;
}

const BATCH = 16, SHORTLIST = 14;
// Look at EVERY photo: if few, one final call; if many, triage all in batches then
// run the full selection on the best shortlist. Returns {r, used} where `used` is the
// image array the returned indices refer to (for storage).
async function analyzeAll(name, mixed, imgs) {
  let inTok = 0, outTok = 0;
  if (imgs.length <= BATCH + 6) {
    const vis = []; for (const g of imgs) vis.push(await visionCopy(g.buffer, g.mediaType));
    const r = await selectPhotos(name, mixed, vis);
    return { r, used: imgs };
  }
  const scores = []; // {gi, score}
  for (let s = 0; s < imgs.length; s += BATCH) {
    const batch = imgs.slice(s, s + BATCH);
    const vis = []; for (const g of batch) vis.push(await visionCopy(g.buffer, g.mediaType));
    const t = await triageBatch(mixed, vis);
    inTok += t.usage?.input_tokens || 0; outTok += t.usage?.output_tokens || 0;
    for (const sc of (t.parsed?.scores || [])) if (!sc.disqualified && sc.index != null && batch[sc.index]) scores.push({ gi: s + sc.index, score: sc.score ?? 0 });
  }
  scores.sort((a, b) => b.score - a.score);
  if (process.env.DEBUG_JSON) console.log(`triage kept ${scores.length}/${imgs.length}; top scores:`, scores.slice(0, 16).map(s => `#${s.gi}:${s.score}`).join(' '));
  const shortlistGI = scores.slice(0, SHORTLIST).map(x => x.gi);
  const used = shortlistGI.map(gi => imgs[gi]);
  if (used.length < 2) return { r: { parsed: { has_self_serve_bay: false } }, used, triageTok: { inTok, outTok } };
  const vis = []; for (const g of used) vis.push(await visionCopy(g.buffer, g.mediaType));
  const r = await selectPhotos(name, mixed, vis);
  return { r, used, triageTok: { inTok, outTok } };
}

// target listings
// SAFETY: exclude mixed (is_touchless) listings — those are LIVE touchless pages
// and overwriting their hero would change the live site. Self-serve-only listings
// have no live page (gated), so applying hero+gallery is risk-free. Mixed listings
// get a separate, careful policy (facility hero that improves both / gallery-only).
let rows = [];
for (let attempt = 0; attempt < 3; attempt++) {
  let q = sb.from('listings')
    .select('id, name, city, state, google_place_id, is_touchless, hero_image, hero_image_source, photos, latitude, longitude, self_service_source')
    .eq('is_self_service', true).is('self_service_reviewed_at', null)
    // Skip closed washes (manually-closed via classification_source, or Google-closed
    // via business_status). The .is.null clauses keep listings with no such flag.
    .or('classification_source.is.null,classification_source.not.ilike.closed*')
    .or('business_status.is.null,business_status.not.in.(CLOSED_PERMANENTLY,CLOSED_TEMPORARILY)')
    .eq('state', STATE).not('google_place_id', 'is', null);
  // MIXED listings are LIVE touchless pages, so overwriting their hero changes the
  // live site — we back up the prior hero (reversible) and give them a facility hero
  // that shows BOTH bay types. Pass --self-only to skip them.
  if (!INCLUDE_MIXED) q = q.not('is_touchless', 'is', true);
  if (MIXED_ONLY) q = q.eq('is_touchless', true); // the careful mixed-facility pass
  if (SKIP_DONE) q = q.or('hero_image_source.is.null,hero_image_source.neq.ai_photo'); // only un-done listings
  if (NEEDS_HUMAN_ONLY) q = q.eq('self_service_source', 'autophoto_needs_human'); // re-process only the flagged
  if (NAME_FILTER) q = q.ilike('name', `%${NAME_FILTER}%`);
  const res = await q.order('city').limit(LIMIT);
  if (!res.error && res.data) { rows = res.data; break; } // empty array is valid; retry only on error/null
  await new Promise(r => setTimeout(r, 1500));
}
const heroBackup = []; // {id, name, prev_hero_image, prev_hero_image_source} for reversibility
console.log(`${STATE}: ${rows?.length || 0} listings to process (${APPLY ? 'APPLY' : 'DRY RUN'}), model ${MODEL}\n`);

let applied = 0, flagged = 0, noPhotos = 0, errors = 0, demoted = 0, streetview = 0, inTok = 0, outTok = 0, photoCalls = 0;
let triageInTok = 0, triageOutTok = 0; // TRIAGE tokens tracked separately (may be a cheaper model)
async function processListing(l) {
  const mixed = l.is_touchless === true;
  const urls = await serpPhotoUrls(l.google_place_id);
  // Download all candidate photos in parallel (network-bound, no API cost). Order is
  // preserved by Promise.all, which matters because later code indexes into `imgs`.
  const imgs = (await Promise.all(urls.slice(0, MAX_PHOTOS).map(u => downloadUrl(u).catch(() => null)))).filter(Boolean);
  // Add a Street View candidate UP FRONT — BEFORE the <2 gate — so a lone good Google
  // photo is NEVER discarded. Laporte returned exactly 1 photo (a perfect "LAPORTE CAR
  // WASH" + bays shot); the old code saw imgs.length<2 and threw it away for a backyard
  // street view. With street view added here, that 1 photo + street view = 2 candidates
  // → the normal path runs and the model picks the good photo as hero. Street view is
  // then only the SOLE candidate when there are genuinely 0 Google photos.
  if (l.latitude != null && l.longitude != null) {
    const sv = await streetViewImage(l.latitude, l.longitude);
    if (sv) imgs.push({ buffer: sv, mediaType: 'image/jpeg' });
  }
  if (imgs.length < 2) {
    // Mobile washes ("movil"/"mobile"/"a domicilio") have no fixed self-serve facility.
    if (MOBILE.test(l.name || '')) {
      demoted++; console.log(`• ${l.name} (${l.city}) — ❌ MOBILE wash (no self-serve facility) — demoted`);
      if (APPLY) await sb.from('listings').update({ is_self_service: false, self_service_source: 'autophoto_mobile' }).eq('id', l.id);
      return;
    }
    // Never touch a MIXED (live touchless) listing's hero — leave it and just move on.
    if (mixed) { noPhotos++; console.log(`• ${l.name} (${l.city}) — no self-serve photos (mixed/live — left as is)`); return; }
    // Self-serve-only with no Google photos: VERIFY the actual pixels — the existing
    // hero AND a street view — and use whichever genuinely shows the car wash. Don't
    // trust hero_image_source labels (leftover 'manual' junk street-views exist).
    const cand = [];
    if (l.hero_image) { const b = await fetchImage(l.hero_image); if (b) cand.push({ buffer: b, src: 'existing' }); }
    if (l.latitude != null && l.longitude != null) { const sv = await streetViewImage(l.latitude, l.longitude); if (sv) cand.push({ buffer: sv, src: 'streetview' }); }
    if (cand.length) {
      const vis = []; for (const c of cand) vis.push(await visionCopy(c.buffer, 'image/jpeg'));
      const rv = await selectPhotos(l.name, mixed, vis);
      inTok += rv.usage?.input_tokens || 0; outTok += rv.usage?.output_tokens || 0;
      const hi = rv.parsed?.hero_index;
      if (rv.parsed?.has_self_serve_bay && hi != null && cand[hi] && !rv.parsed?.needs_human) {
        // Confident: an image (existing hero OR street view) clearly shows the wash → use it, no flag.
        streetview++; console.log(`• ${l.name} (${l.city}) — 🛣️ ${cand[hi].src} image shows the wash → hero`);
        if (APPLY) { const url = await upload(await cropHero(cand[hi].buffer, {}), 'image/jpeg', l.id, 'hero'); if (url) { heroBackup.push({ id: l.id, name: l.name, mixed: false, prev_hero_image: l.hero_image, prev_hero_image_source: l.hero_image_source }); const srcFix = l.self_service_source === 'autophoto_needs_human' ? { self_service_source: 'autophoto_applied' } : {}; await sb.from('listings').update({ hero_image: url, hero_image_source: 'street_view_auto', ...srcFix }).eq('id', l.id); } }
        return;
      }
      // Michael's rule: when Google photos are missing/thin, don't leave the listing
      // blank for him to hunt — still give it a hero from STREET VIEW (preferred) or
      // the existing image, then FLAG for review. Never demote on absent photos.
      const svc = cand.find(c => c.src === 'streetview') || cand[0];
      flagged++; console.log(`• ${l.name} (${l.city}) — ⚠ NEEDS HUMAN — thin Google photos; set ${svc.src} as hero for review`);
      if (APPLY) { const url = await upload(await cropHero(svc.buffer, {}), 'image/jpeg', l.id, 'hero'); if (url) { heroBackup.push({ id: l.id, name: l.name, mixed: false, prev_hero_image: l.hero_image, prev_hero_image_source: l.hero_image_source }); await sb.from('listings').update({ hero_image: url, hero_image_source: 'street_view_auto', self_service_source: 'autophoto_needs_human' }).eq('id', l.id); } }
      return;
    }
    // No candidates at all (no coords AND no existing hero) — flag for review, no hero to set.
    flagged++; console.log(`• ${l.name} (${l.city}) — ⚠ NEEDS HUMAN (no photos or street view to judge)`);
    if (APPLY) await sb.from('listings').update({ self_service_source: 'autophoto_needs_human' }).eq('id', l.id);
    return;
  }

  const { r, used, triageTok } = await analyzeAll(l.name, mixed, imgs);
  if (triageTok) { triageInTok += triageTok.inTok; triageOutTok += triageTok.outTok; }
  if (r.err) { errors++; console.log(`• ${l.name} — vision error ${r.err}`); return; }
  inTok += r.usage?.input_tokens || 0; outTok += r.usage?.output_tokens || 0;
  const p = r.parsed || {};
  if (process.env.DEBUG_JSON) console.log(`\n=== ${l.name} (${imgs.length} looked at, ${used.length} finalists) ===\n` + JSON.stringify(p, null, 2) + '\n');
  // Policy (Michael, 2026-07-13): NEVER auto-demote on a "no self-serve bay" verdict —
  // it's too often WRONG on real washes (Mach 1's open-canopy wand bays read as "not a
  // walled stall"; Group A). FLAG for human review instead (keep is_self_service=true),
  // and set the best available photo as a PROVISIONAL hero so the listing isn't blank
  // in the queue. Genuine tunnels/gas/detail get one-click rejected in review. (MOBILE
  // washes above stay a hard demote — that's a reliable name signal, not a vision guess.)
  if (p.has_self_serve_bay === false) {
    flagged++;
    // Provisional hero = highest-visual-quality non-disqualified shot. Skip for MIXED
    // (live touchless) listings — never overwrite their live hero on a low-confidence pass.
    const best = !mixed ? (p.images || []).filter(x => used[x.index] && !x.disqualified).sort((a, b) => (b.visual_quality ?? 0) - (a.visual_quality ?? 0))[0] : null;
    console.log(`• ${l.name} (${l.city}) — ⚠ NEEDS HUMAN (vision unsure it's self-serve${best ? '; best photo set as provisional hero' : ''})`);
    if (APPLY) {
      const upd = { self_service_source: 'autophoto_needs_human' };
      if (best && used[best.index]) {
        const url = await upload(await cropHero(await hiResBuffer(used[best.index]), {}), 'image/jpeg', l.id, 'hero');
        if (url) { heroBackup.push({ id: l.id, name: l.name, mixed, prev_hero_image: l.hero_image, prev_hero_image_source: l.hero_image_source }); upd.hero_image = url; upd.hero_image_source = 'ai_photo'; }
      }
      await sb.from('listings').update(upd).eq('id', l.id);
    }
    return;
  }
  const heroImg = p.images?.find(x => x.index === p.hero_index);
  // has_self_serve_bay is TRUE here (the false case returned above), so the listing IS
  // self-serve. AUTO-APPLY it into the normal approve queue — do NOT bury a confirmed
  // self-serve wash in "Need Review" just because the hero pick is moderate. The old gate
  // (needs_human / confidence>=0.5 / hero_worthy>=3) flagged obviously-self-serve washes
  // like Speedy & Hilltop (clear bays, but a distant-building hero). Now we only need SOME
  // hero to show — a usable AI pick, or an existing hero to keep.
  const heroUsable = p.hero_index != null && used[p.hero_index] && heroImg && !heroImg.disqualified;
  const good = heroUsable || !!l.hero_image;
  // Gallery: only distinct, non-disqualified, decent-quality shots (no padding).
  const gal = (p.gallery_indices || []).filter(i => {
    if (i === p.hero_index || !used[i]) return false;
    const gi = p.images?.find(x => x.index === i);
    return gi && !gi.disqualified && (gi.visual_quality ?? 0) >= 3;
  }).slice(0, GALLERY_MAX);
  const tag = `${mixed ? '[mixed]' : '[self]'}`;

  if (!good) {
    // Reaches here only when it's self-serve but we found NO usable hero AND there's no
    // existing hero to keep — genuinely needs a human to add one.
    flagged++; console.log(`• ${l.name} (${l.city}) ${tag} — ⚠ NEEDS HUMAN (self-serve, but no usable hero found)`);
    // Tag it so it surfaces in the photo-audit "Need Review" tab instead of being
    // lost in the full queue. Provenance only — leaves is_self_service +
    // self_service_reviewed_at untouched, so visibility/approval are unaffected.
    if (APPLY) await sb.from('listings').update({ self_service_source: 'autophoto_needs_human' }).eq('id', l.id);
  }
  else {
    const ct = p.hero_crop || {};
    const trims = [ct.trim_left, ct.trim_right, ct.trim_top, ct.trim_bottom].some(v => v) ? ` crop{L${ct.trim_left||0} R${ct.trim_right||0} T${ct.trim_top||0} B${ct.trim_bottom||0}}` : '';
    // KEEP-OR-REPLACE existing hero (Michael's rule). Applies to ANY listing that
    // already has a hero (mixed facilities share it with their LIVE touchless page;
    // self-serve listings may have a manual pick). KEEP the current hero if it already
    // shows the self-serve side (don't rescreen a good curated pick) and just enrich the
    // gallery; REPLACE it only if it's touchless-only / shows no self-serve bay. Listings
    // with no hero always take the AI pick.
    let keepHero = false, assessNote = '';
    if (l.hero_image) {
      const cur = await fetchImage(l.hero_image);
      if (cur) {
        const a = await assessHeroSelfServe(cur);
        if (a?.usage) { inTok += a.usage.input_tokens || 0; outTok += a.usage.output_tokens || 0; }
        if (a?.parsed?.shows_selfserve === true) { keepHero = true; assessNote = ' — KEPT current hero (already shows self-serve), gallery enriched'; }
        else if (a) { assessNote = ' — current hero touchless-only → replacing with self-serve hero'; }
      }
    }
    // No usable AI hero pick → we must keep the existing hero (can't crop a null pick).
    // good=true guarantees l.hero_image exists in this case.
    if (!heroUsable) { keepHero = true; assessNote = ' — kept existing hero (no stronger AI pick); gallery enriched'; }
    console.log(`• ${l.name} (${l.city}) ${tag} [${imgs.length}📷] — ${keepHero ? 'hero KEPT' : `hero #${p.hero_index} ${heroImg?.category} (hw ${heroImg?.hero_worthy}, q ${heroImg?.visual_quality})${trims}`}, gallery [${gal.join(',')}] conf ${p.confidence}${assessNote}`);
    if (APPLY) {
      const existing = Array.isArray(l.photos) ? l.photos.filter(Boolean) : [];
      const dedupe = arr => arr.filter((u, i, a) => u && a.indexOf(u) === i);
      // NEVER discard existing photos (Michael curated many, incl. touchless-equipment
      // shots on mixed facilities). MERGE existing + new picks. Dedupe by CONTENT (not
      // just URL): perceptual-hash the active hero + every existing photo, then only ADD
      // a new self-serve pick if its image isn't already present — otherwise the same
      // Google photo shows twice (old file + fresh ai-* download). Existing photos are
      // always kept as-is; we just never pile a duplicate on top. Cap 8, existing first.
      const seen = [];
      const seed = async (buf) => { if (buf) { try { seen.push(await phash(buf)); } catch {} } };
      let heroUrl = null;
      if (keepHero) { await seed(await fetchImage(l.hero_image)); }
      else { const hb = await cropHero(await hiResBuffer(used[p.hero_index]), p.hero_crop); await seed(hb); heroUrl = await upload(hb, 'image/jpeg', l.id, 'hero'); }
      // Base = the replaced hero (demoted into the gallery) + existing curated photos.
      // Existing photos are ALL preserved — EXCEPT one that is literally the KEPT hero
      // AGAIN (the "hero shows twice, once as hero + once in gallery" bug Michael caught
      // on Buffs Wash). We identify that dup by EXACT URL match to the current hero, or a
      // tight phash match to it (a crop-variant of the same shot: Buffs' was 18 bits away;
      // genuinely different shots are 30+, so 20 splits them). DO NOT use a filename
      // heuristic — a blanket /hero-cropped/ regex matched a mixed listing's DISTINCT old
      // touchless hero (also stored as hero-cropped-*) and DELETED it from the gallery
      // (Green Car Wash lost its Belanger Saber touchless shots). Only the actual current
      // hero is a dup; every other curated photo — including demoted old touchless heroes
      // — must be kept.
      const heroSeed = seen.length ? seen[0] : null;
      const rawBase = dedupe([(!keepHero ? l.hero_image : null), ...existing].filter(Boolean));
      const baseUrls = [];
      for (const url of rawBase) {
        const buf = await fetchImage(url);
        let h = null; if (buf) { try { h = await phash(buf); } catch {} }
        const isHeroDup = keepHero && (url === l.hero_image || (h != null && heroSeed != null && hamLE(heroSeed, h, 20)));
        if (isHeroDup) continue; // it's the hero again → don't repeat it in the gallery
        if (h != null) seen.push(h);
        baseUrls.push(url);
      }
      const newUrls = [];
      for (const gi of gal) {
        const buf = used[gi].buffer;
        let h = null; try { h = await phash(buf); } catch {} // phash on the (res-independent) selection copy
        if (h != null && seen.some(s => hamLE(s, h, 5))) continue; // content duplicate → skip
        if (h != null) seen.push(h);
        const u = await upload(await hiResBuffer(used[gi]), 'image/jpeg', l.id, `g${gi}`); // store full-res
        if (u) newUrls.push(u);
      }
      const merged = [...baseUrls, ...newUrls].slice(0, 8);
      // A successful apply means it's confirmed self-serve with a hero — so if it was
      // previously FLAGGED (autophoto_needs_human), clear that so it leaves the "Need
      // Review" tab. Don't touch any other classification source (google_category etc.).
      const srcFix = l.self_service_source === 'autophoto_needs_human' ? { self_service_source: 'autophoto_applied' } : {};
      if (keepHero) {
        const upd = { ...srcFix };
        if (merged.length !== existing.length) upd.photos = merged;
        if (Object.keys(upd).length) await sb.from('listings').update(upd).eq('id', l.id);
        applied++;
      } else {
        // Back up the prior hero AND gallery before overwriting — matters most for MIXED
        // listings whose hero is shared with the LIVE touchless page (fully reversible).
        heroBackup.push({ id: l.id, name: l.name, mixed, prev_hero_image: l.hero_image, prev_hero_image_source: l.hero_image_source, prev_photos: existing });
        if (heroUrl) { await sb.from('listings').update({ hero_image: heroUrl, hero_image_source: 'ai_photo', photos: merged, ...srcFix }).eq('id', l.id); applied++; }
      }
    } else applied++;
  }
}

// Run CONCURRENCY listings at once via a bounded worker pool. JS is single-threaded,
// so the shared counters/heroBackup mutate safely (no real data races); each worker
// pulls the next un-taken listing until the queue is empty.
let _next = 0;
async function worker() {
  while (_next < rows.length) {
    const l = rows[_next++];
    try { await processListing(l); }
    catch (e) { errors++; console.log(`• ${l.name} (${l.city}) — ERROR ${e.message}`); }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length || 1) }, worker));

// Sonnet = final selection/assess/crop; triage priced at its own model's rate.
const haikuTriage = /haiku/i.test(TRIAGE_MODEL);
const tIn = haikuTriage ? 1 : 3, tOut = haikuTriage ? 5 : 15; // Haiku 4.5 ~$1/$5 per M; Sonnet ~$3/$15
const selCost = (inTok / 1e6) * 3 + (outTok / 1e6) * 15;
const triageCost = (triageInTok / 1e6) * tIn + (triageOutTok / 1e6) * tOut;
const cost = selCost + triageCost; // photos are free via SerpAPI quota
console.log(`\n==================== AUTOPHOTO ${STATE} DONE ====================`);
console.log(`${APPLY ? 'Applied' : 'Would apply'}: ${applied}  |  ❌ Not self-serve (demoted): ${demoted}  |  ⚠ Needs human: ${flagged}  |  street-view heroes: ${streetview}  |  too few photos: ${noPhotos}  |  errors: ${errors}`);
if (APPLY && heroBackup.length) {
  const f = `scripts/_backup_autophoto_hero_${STATE}_${Date.now()}.json`;
  writeFileSync(f, JSON.stringify(heroBackup, null, 2));
  console.log(`Prior heroes backed up (reversible): ${f}  (${heroBackup.filter(b => b.mixed).length} were mixed/live-touchless)`);
}
console.log(`Est. cost: ~$${cost.toFixed(2)} (Sonnet select $${selCost.toFixed(2)} + ${haikuTriage ? 'Haiku' : 'Sonnet'} triage $${triageCost.toFixed(2)}; TRIAGE_MODEL=${TRIAGE_MODEL}; ${serpCalls} cache lookups, photos free via headless-browser scrape)`);
