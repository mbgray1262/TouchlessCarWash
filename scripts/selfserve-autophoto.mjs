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
const MODEL = 'claude-sonnet-5'; // tasteful enough for selection at a fraction of Opus cost
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
const NAME_FILTER = process.argv.slice(4).find(a => !a.startsWith('--')); // optional name ILIKE for targeted runs
const MOBILE = /\b(m[oó]vil|mobile|a\s?domicilio|domicilio|at\s?home|to\s?your)\b/i; // mobile washes = no fixed self-serve facility

function rubric(mixed) {
  return `You are a skilled photo editor curating images for a self-service car wash directory.

This location is: ${mixed ? 'MIXED — it is ALSO a touchless/automatic wash. Self-serve seekers view this page, so the imagery MUST clearly show the self-serve side, never only the automatic bay.' : 'SELF-SERVE ONLY.'}

WHAT A SELF-SERVE WASH BAY IS (read VERY carefully): an ENCLOSED or 3-SIDED covered STALL that a VEHICLE — a car, truck, van, SUV, BOAT, RV, trailer, or motorcycle — is driven/pulled INTO to be washed by hand. It has WALLS on the sides separating each bay, a hanging spray WAND/lance (a trigger spray gun on a hose) mounted on the wall, and usually a coin box + foam brush. The vehicle sits INSIDE a walled/covered stall. ANY vehicle in such a stall (even a boat on a trailer) IS a valid self-serve wash bay shot. A facility/exterior photo that clearly shows a ROW OF THESE WALLED STALLS also counts.

CRITICAL — a self-serve VACUUM area is NOT a wash bay; it is IRRELEVANT and must NEVER be hero or gallery (this is a common mistake — do not make it):
  - It is an OPEN lot with NO side walls between cars — cars park out in the open beside upright VACUUM CANISTERS / cylinders (often colored blue or red) mounted on posts or arched metal frames, sometimes under a light canopy.
  - Those are VACUUM/shampoo canisters with thick suction hoses — NOT wash stalls, NOT spray wands.
  - A ROW of canister-on-post stations over open parking = a VACUUM area. Customers use it themselves, but it is NOT a self-serve WASH bay. DISQUALIFY every such photo (category = "vacuum").
  Also NOT wash bays: automatic/touchless in-bay washes, tunnel washes, hand-wash/detail areas.

STEP 0 — VERIFY FIRST: does AT LEAST ONE photo clearly show a genuine self-serve WASH BAY — an ENCLOSED/WALLED stall with a spray wand (a vehicle inside a walled covered stall), or a facility view of a ROW of such walled stalls? A row of vacuum canisters in an open lot DOES NOT count. If YES, set has_self_serve_bay=true. If the ONLY "self-serve" photos are vacuum-canister stations, open-lot parking, an automatic/tunnel wash, or signage — set has_self_serve_bay=false, hero_index=null, gallery_indices=[] and STOP.

STEP 1 — (only if has_self_serve_bay) Score EVERY image (skip none). For each: category, self_serve_relevance (0-5), visual_quality (0-5), hero_worthy (0-5), disqualified (bool) + reason.

STEP 2 — Pick the HERO: the single most ATTRACTIVE and INFORMATIVE image — one that both looks genuinely nice to a typical visitor AND clearly shows what this self-serve wash looks like. Make a BALANCED, tasteful judgment; do NOT mechanically prefer one type. A great hero can be ANY of these — pick whichever is actually the nicest of THIS set:
  - a beautifully-lit facility/exterior clearly showing the open self-serve bays (warm golden light or bright even light) — these are OFTEN the best heroes
  - a clean car in a bright, well-lit self-serve bay
  - a clear, well-composed wide shot of the bays
  IF THIS IS A MIXED facility (also touchless/automatic): strongly prefer a WIDE FACILITY/exterior shot that shows BOTH the self-serve bays AND the touchless/automatic bay together, so a visitor looking for EITHER type sees themselves in it. NEVER use a close-up of only the touchless/automatic bay as the hero.
  REWARD: good natural light, clean composition, a clear read of the self-serve bays, sharpness, an inviting feel. PENALIZE: dark/harsh/blown-out light, awkward angles that hide the bays, clutter, or a frame dominated by a single car with little context. Between two decent options, choose the one a typical person would find more attractive.
  Always pick the best available; set hero_index null / needs_human true ONLY if nothing usably shows the self-serve wash.
  Also return hero_crop: fractions (0 to 0.4) to TRIM from each edge of the hero to isolate the main subject (the bays/facility) and remove distracting elements at the edges — e.g. a fence, an adjacent building, a pole, a parked car off to the side, or empty sky/pavement. Use 0 for edges that are already clean; keep the bays fully in frame and do NOT over-crop. The image is later center-cropped to 16:9 within whatever remains.

STEP 3 — Pick GALLERY images (up to ${GALLERY_MAX}): genuine, attractive self-serve SCENES. PRIORITIZE great IN-BAY ACTION shots — a whole VEHICLE inside a recognizable BAY being washed, covered in soap/foam, or rinsed with the wand — these are the most engaging. The vehicle AND the bay must be clearly recognizable; NEVER an extreme close-up of only soap/foam/water/suds on a car's paint, glass, or windshield (an abstract texture shot with no bay or full vehicle is confusing and non-informative — DISQUALIFY it). EQUALLY STRONG (do NOT rank below a car-in-bay shot): a CLEAN, EMPTY self-serve BAY that clearly shows the equipment — the hanging spray WAND/lance, foam brush, coin/pay box, and the walled stall. A well-lit empty bay with clear self-serve equipment is just as valuable and informative as a bay with a car in it; score its visual_quality on its own merits and INCLUDE it — never skip or under-score it just because no vehicle is present. Also good: an appealing wand-in-use shot, a bright wide facility. Aim for variety. Include AS MANY genuinely good shots as exist (up to ${GALLERY_MAX}) — more good images = more engagement — but still NEVER pad with weak/useless filler (return fewer, even zero, rather than include a bad one).

NEVER pick as hero OR gallery:
  - ANY brush, cloth strip, mitter curtain, foam-pad, or abrasive contact equipment — STRICTLY forbidden (violates our paint-safety brand), even if otherwise nice.
  - Messy/cluttered: towels on cars, cars blocking the bays, tangled hoses in the foreground, junk in frame.
  - For a MIXED site: an automatic/touchless in-bay or tunnel shot as the hero; never let automatic-only be the only imagery.
  - A customer's car with no bay/facility context; car interiors/dashboards; gas pumps; maps; screenshots; food/drinks; people portraits; blurry, very dark, low-res, watermarked, or stock.
  - ANY VACUUM or add-on-vending shot — ABSOLUTELY FORBIDDEN as hero AND gallery, no exceptions. This includes: vacuum canisters/cylinders, vacuum hoses (the thick corrugated/ribbed tubes, often blue), vacuum nozzles/wands, air/fragrance/shampoo/"Fragramatics" or other coin-op vending machines, and their pay stations — WHETHER OR NOT a person is using them, and even if a machine or hose is only PART of the frame's subject. Vacuum shots are completely useless to a WASH directory. If a photo's main subject is vacuum/vending equipment or a vacuum hose, DISQUALIFY it.
  - EXTREME CLOSE-UPS of soap/foam/suds/water on a car's paint, glass, or windshield with no visible bay or full vehicle — abstract texture/surface shots. They are confusing and non-informative. Never hero or gallery.
  - ANY graphic / flyer / poster / event or promotional announcement / text-overlay marketing image — e.g. a "pop-up market" flyer, a food-vendor ad, an event poster, a coupon — ESPECIALLY one advertising anything OTHER than THIS car wash. Hero and gallery images must be real PHOTOGRAPHS of the wash facility/bays, never a graphic, flyer, or logo. (Only a plain photo of the wash's OWN name sign is acceptable, and only as a last-resort hero — never gallery.)

NEVER pick as GALLERY (these are fine to note but are useless filler — reject them from the gallery): a shot whose only value is the building name/sign on a wall; a close-up of a payment/coin/token machine; a bare vacuum canister or a lone hose/tube; truly empty pavement with NO bay walls or equipment in frame. (These may still be acceptable as a last-resort HERO only if truly nothing better exists — but never as gallery.) NOTE: an empty WASH BAY that shows the walled stall + spray wand/foam brush/coin box is NOT "empty pavement" and NOT filler — it is a strong gallery image (see STEP 3).

Return ONLY JSON:
{"has_self_serve_bay":true,"images":[{"index":0,"category":"...","self_serve_relevance":4,"visual_quality":4,"hero_worthy":5,"disqualified":false,"reason":"..."}],"hero_index":2,"hero_crop":{"trim_left":0,"trim_right":0.2,"trim_top":0.1,"trim_bottom":0},"gallery_indices":[4,1],"confidence":0.86,"needs_human":false,"reason":"why these are the best of the set"}`;
}

// Get EVERY one of a place's Google Maps photos via SerpAPI (the Places API
// hard-caps at 10). place_id -> data_id, then paginate google_maps_photos through
// ALL pages (follow next_page_token) until the gallery is exhausted — no artificial cap.
async function serpPhotoUrls(placeId) {
  try {
    const r1 = await fetch(`https://serpapi.com/search.json?engine=google_maps&place_id=${encodeURIComponent(placeId)}&api_key=${SKEY}`, { signal: AbortSignal.timeout(25000) });
    const j1 = await r1.json(); serpCalls++;
    const dataId = j1.place_results?.data_id;
    if (!dataId) return [];
    const out = []; let token = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      let url = `https://serpapi.com/search.json?engine=google_maps_photos&data_id=${encodeURIComponent(dataId)}&api_key=${SKEY}`;
      if (token) url += `&next_page_token=${encodeURIComponent(token)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
      const j = await r.json(); serpCalls++;
      const pagePhotos = (j.photos || []).map(p => p.image).filter(u => typeof u === 'string' && u.includes('googleusercontent'));
      out.push(...pagePhotos);
      token = j.serpapi_pagination?.next_page_token;
      if (!token || !pagePhotos.length) break; // no more pages
    }
    // Dedupe (base URL, ignoring size params) while preserving order.
    const seen = new Set(), uniq = [];
    for (const u of out) { const k = u.split('=')[0]; if (!seen.has(k)) { seen.add(k); uniq.push(u); } }
    return uniq.slice(0, MAX_PHOTOS);
  } catch { return []; }
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
async function streetViewImage(lat, lng) {
  try {
    const meta = await (await fetch(signGoogleUrl(`https://maps.googleapis.com/maps/api/streetview/metadata?size=2048x1152&location=${lat},${lng}&key=${GKEY}`), { signal: AbortSignal.timeout(12000) })).json();
    if (meta.status !== 'OK') return null; // no imagery here
    const r = await fetch(signGoogleUrl(`https://maps.googleapis.com/maps/api/streetview?size=2048x1152&location=${lat},${lng}&fov=90&heading=0&pitch=0&key=${GKEY}`), { signal: AbortSignal.timeout(15000) });
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
// Download a googleusercontent photo at high resolution (append =w1600). Free
// (public image URL) — full-res kept for storage; a downscaled copy is made for vision.
async function downloadUrl(url) {
  try {
    const hi = url.split('=')[0] + '=w1600';
    const r = await fetch(hi, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < MIN_BYTES || buf.length > 8_000_000) return null;
    return { buffer: buf, mediaType: ct };
  } catch { return null; }
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
  const prompt = `Score each candidate photo for a SELF-SERVICE car wash directory (site is ${mixed ? 'MIXED (also automatic/touchless)' : 'self-serve only'}). A self-serve WASH BAY = an ENCLOSED/WALLED covered STALL a car is driven into, with a spray WAND on the wall. For EACH image return its index and score 0-5 (5 = a beautiful, clear self-serve WASH BAY or a row of walled stalls; 0 = irrelevant/junk). An EMPTY bay that clearly shows the equipment (spray wand/lance, foam brush, coin box, walled stall) scores JUST AS HIGH as a bay with a vehicle — do not penalize it for having no car. Mark disqualified=true for: any brush/abrasive equipment; automatic/tunnel-only; a self-serve VACUUM area (upright canisters/cylinders on posts or arched frames in an OPEN lot with no walled stalls — NOT a wash bay); ANY shot whose subject is vacuum/vending equipment — vacuum canisters, vacuum hoses (thick corrugated tubes, often blue), vacuum nozzles, air/fragrance/shampoo/"Fragramatics" or other coin-op vending machines and their pay stations — even if a person is using them or it is only part of the frame (ALWAYS disqualified); messy/blocked bays; close-ups of coin/sign/machine; a car with no bay context; car interiors; gas; food; maps; any graphic/flyer/poster/event-or-promo announcement/logo/coupon (especially advertising something other than this wash); extreme close-ups of soap/foam/water on paint/glass with no bay or full vehicle (abstract texture shots); blurry/dark. Return ONLY JSON: {"scores":[{"index":0,"score":4,"disqualified":false}]}`;
  const content = [{ type: 'text', text: prompt }];
  visionImgs.forEach((g, i) => { content.push({ type: 'text', text: `Image ${i}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: g.mediaType, data: g.base64 } }); });
  const body = JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: 'user', content }] });
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
    .select('id, name, city, state, google_place_id, is_touchless, hero_image, hero_image_source, photos, latitude, longitude')
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
  if (NAME_FILTER) q = q.ilike('name', `%${NAME_FILTER}%`);
  const res = await q.order('city').limit(LIMIT);
  if (!res.error && res.data) { rows = res.data; break; } // empty array is valid; retry only on error/null
  await new Promise(r => setTimeout(r, 1500));
}
const heroBackup = []; // {id, name, prev_hero_image, prev_hero_image_source} for reversibility
console.log(`${STATE}: ${rows?.length || 0} listings to process (${APPLY ? 'APPLY' : 'DRY RUN'}), model ${MODEL}\n`);

let applied = 0, flagged = 0, noPhotos = 0, errors = 0, demoted = 0, streetview = 0, inTok = 0, outTok = 0, photoCalls = 0;
async function processListing(l) {
  const mixed = l.is_touchless === true;
  const urls = await serpPhotoUrls(l.google_place_id);
  // Download all candidate photos in parallel (network-bound, no API cost). Order is
  // preserved by Promise.all, which matters because later code indexes into `imgs`.
  const imgs = (await Promise.all(urls.slice(0, MAX_PHOTOS).map(u => downloadUrl(u).catch(() => null)))).filter(Boolean);
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
        streetview++; console.log(`• ${l.name} (${l.city}) — 🛣️ ${cand[hi].src} image shows the wash → hero`);
        if (APPLY) { const url = await upload(await cropHero(cand[hi].buffer, {}), 'image/jpeg', l.id, 'hero'); if (url) { heroBackup.push({ id: l.id, name: l.name, mixed: false, prev_hero_image: l.hero_image, prev_hero_image_source: l.hero_image_source }); await sb.from('listings').update({ hero_image: url, hero_image_source: 'street_view_auto' }).eq('id', l.id); } }
        return;
      }
    }
    // No Google photos and neither the existing hero nor street view shows a car wash → demote.
    demoted++; console.log(`• ${l.name} (${l.city}) — ❌ no photos & no image shows a car wash — demoted`);
    if (APPLY) await sb.from('listings').update({ is_self_service: false, self_service_source: 'autophoto_no_evidence' }).eq('id', l.id);
    return;
  }

  const { r, used, triageTok } = await analyzeAll(l.name, mixed, imgs);
  if (triageTok) { inTok += triageTok.inTok; outTok += triageTok.outTok; }
  if (r.err) { errors++; console.log(`• ${l.name} — vision error ${r.err}`); return; }
  inTok += r.usage?.input_tokens || 0; outTok += r.usage?.output_tokens || 0;
  const p = r.parsed || {};
  if (process.env.DEBUG_JSON) console.log(`\n=== ${l.name} (${imgs.length} looked at, ${used.length} finalists) ===\n` + JSON.stringify(p, null, 2) + '\n');
  // VERIFY (Michael's rule): if NO photo shows a genuine self-serve wash bay, this
  // isn't a self-serve wash — demote it so it never reaches the review queue.
  if (p.has_self_serve_bay === false) {
    demoted++;
    console.log(`• ${l.name} (${l.city}) — ❌ NOT SELF-SERVE (no wash bay in any photo) — demoted`);
    if (APPLY) await sb.from('listings').update({ is_self_service: false, self_service_source: 'autophoto_not_selfserve' }).eq('id', l.id);
    return;
  }
  const heroImg = p.images?.find(x => x.index === p.hero_index);
  const heroOk = p.hero_index != null && used[p.hero_index] && heroImg && !heroImg.disqualified && (heroImg.hero_worthy ?? 0) >= MIN_HERO_SCORE;
  const good = !p.needs_human && (p.confidence ?? 0) >= PROMOTE_CONF && heroOk;
  // Gallery: only distinct, non-disqualified, decent-quality shots (no padding).
  const gal = (p.gallery_indices || []).filter(i => {
    if (i === p.hero_index || !used[i]) return false;
    const gi = p.images?.find(x => x.index === i);
    return gi && !gi.disqualified && (gi.visual_quality ?? 0) >= 3;
  }).slice(0, GALLERY_MAX);
  const tag = `${mixed ? '[mixed]' : '[self]'}`;

  if (!good) {
    flagged++; console.log(`• ${l.name} (${l.city}) ${tag} — ⚠ NEEDS HUMAN (conf ${p.confidence}, ${p.reason || ''})`);
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
    console.log(`• ${l.name} (${l.city}) ${tag} [${imgs.length}📷] — ${keepHero ? 'hero KEPT' : `hero #${p.hero_index} ${heroImg?.category} (hw ${heroImg?.hero_worthy}, q ${heroImg?.visual_quality})${trims}`}, gallery [${gal.join(',')}] conf ${p.confidence}${assessNote}`);
    if (APPLY) {
      // Upload the enriched gallery (great self-serve shots) for both keep + replace.
      const galUrls = [];
      for (const gi of gal) { const u = await upload(used[gi].buffer, used[gi].mediaType, l.id, `g${gi}`); if (u) galUrls.push(u); }
      // NEVER discard existing photos (Michael manually curated many, incl. touchless-
      // equipment shots on mixed facilities). MERGE: keep everything already in the
      // gallery and ADD the new self-serve picks. Dedupe by URL, cap at 8 (tool shows 8),
      // existing photos prioritized so a cap never drops a curated one.
      const existing = Array.isArray(l.photos) ? l.photos.filter(Boolean) : [];
      const dedupe = arr => arr.filter((u, i, a) => u && a.indexOf(u) === i);
      if (keepHero) {
        const merged = dedupe([...existing, ...galUrls]).slice(0, 8);
        if (merged.length !== existing.length) await sb.from('listings').update({ photos: merged }).eq('id', l.id);
        applied++;
      } else {
        // Back up the prior hero AND gallery before overwriting — matters most for MIXED
        // listings whose hero is shared with the LIVE touchless page (fully reversible).
        heroBackup.push({ id: l.id, name: l.name, mixed, prev_hero_image: l.hero_image, prev_hero_image_source: l.hero_image_source, prev_photos: existing });
        const heroUrl = await upload(await cropHero(used[p.hero_index].buffer, p.hero_crop), 'image/jpeg', l.id, 'hero');
        if (heroUrl) {
          // The REPLACED hero is not thrown away — it becomes the FIRST gallery image
          // (it's the touchless-equipment shot that matters for the mixed facility's
          // touchless side), followed by the existing gallery, then the new self-serve picks.
          const merged = dedupe([l.hero_image, ...existing, ...galUrls]).slice(0, 8);
          await sb.from('listings').update({ hero_image: heroUrl, hero_image_source: 'ai_photo', photos: merged }).eq('id', l.id);
          applied++;
        }
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

const cost = (inTok / 1e6) * 3 + (outTok / 1e6) * 15; // Sonnet vision only; photos are free via SerpAPI quota
console.log(`\n==================== AUTOPHOTO ${STATE} DONE ====================`);
console.log(`${APPLY ? 'Applied' : 'Would apply'}: ${applied}  |  ❌ Not self-serve (demoted): ${demoted}  |  ⚠ Needs human: ${flagged}  |  street-view heroes: ${streetview}  |  too few photos: ${noPhotos}  |  errors: ${errors}`);
if (APPLY && heroBackup.length) {
  const f = `scripts/_backup_autophoto_hero_${STATE}_${Date.now()}.json`;
  writeFileSync(f, JSON.stringify(heroBackup, null, 2));
  console.log(`Prior heroes backed up (reversible): ${f}  (${heroBackup.filter(b => b.mixed).length} were mixed/live-touchless)`);
}
console.log(`Est. cost: ~$${cost.toFixed(2)} Sonnet vision (${serpCalls} SerpAPI searches used, photos free)`);
