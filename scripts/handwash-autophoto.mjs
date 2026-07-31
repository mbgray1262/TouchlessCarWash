/**
 * AUTONOMOUS hand-wash photo selection + self-serve weed-out.
 *
 * For each unreviewed is_hand_wash listing: use the FULL Google gallery (harvested by
 * scripts/maps_gallery.py — ALL photos, not the Places-API 10-cap) plus a Street View
 * candidate, have Claude Sonnet (a) CONFIRM it's an ATTENDED hand wash (attendants wash
 * the car for you) and NOT a self-serve wand-bay / tunnel / vacuum lot, and (b) pick an
 * attractive hero + 3-5 gallery shots per Michael's art direction.
 *
 * Photo source: a gallery JSON produced by maps_gallery.py ({listing_id:{title,match,urls[]}}).
 *
 * VALIDATION (default): writes a self-contained HTML review page (picks embedded as data
 *   URIs) and touches NOTHING in the DB, so Michael eyeballs the picks first.
 *   node scripts/handwash-autophoto.mjs --gallery /tmp/hw_gallery.json --meta /tmp/hw_meta.json --html /tmp/hw_review.html
 * APPLY: node scripts/handwash-autophoto.mjs --gallery ... --meta ... --apply
 *   sets hero_image + photos (+ hand_wash_source), or is_hand_wash=false when vision is
 *   confident it's self-serve. Leaves hand_wash_reviewed_at NULL — Michael still approves
 *   in the photo-audit Hand Wash queue.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import crypto from 'node:crypto';

const arg = (flag, def = null) => { const i = process.argv.indexOf(flag); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const AKEY = env.ANTHROPIC_API_KEY, GKEY = env.GOOGLE_PLACES_API_KEY, SIGN_SECRET = env.GOOGLE_URL_SIGNING_SECRET;
const MODEL = 'claude-sonnet-5';
const TRIAGE_MODEL = process.env.TRIAGE_MODEL || MODEL;
const GALLERY_FILE = arg('--gallery', '/tmp/hw_gallery.json');
const META_FILE = arg('--meta', '/tmp/hw_meta.json');
const HTML_OUT = arg('--html', '/tmp/hw_review.html');
const APPLY = process.argv.includes('--apply');
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '3', 10);
const MAX_PHOTOS = 120, PHOTO_W = 1600, VISION_W = 640, MIN_BYTES = 5000, GALLERY_MAX = 5;

function rubric() {
  return `You are a skilled photo editor curating images for an ATTENDED HAND CAR WASH directory.

WHAT AN ATTENDED HAND CAR WASH IS: a business where STAFF/ATTENDANTS wash each vehicle BY HAND — with wash mitts, sponges, cloths, foam, hand-held pressure wands, buckets, and drying towels — while the customer waits or drops the car off. Cars are typically lined up and workers are actively soaping, scrubbing, rinsing, or towel-drying them, often outdoors, under a canopy, or inside an open building. Full-service auto detailing shops that hand-wash also qualify. Unlike a touchless wash, HAND CONTACT (mitts/sponges/cloths) is expected and GOOD here — never penalize a photo for showing sponges, mitts, foam, or hands on the car.

STEP 0 — CLASSIFY FIRST. Decide is_hand_wash:
  - TRUE if the photo set shows an attended hand wash: attendants hand-washing/drying vehicles, hand-wash/detailing work, or a facility clearly branded/set up for attended hand washing.
  - FALSE (this is the important weed-out) if the set instead shows a SELF-SERVE / coin-op operation where the CUSTOMER washes their OWN car: rows of walled drive-in STALLS each with a WALL-MOUNTED spray wand + coin/pay box and NO staff working on cars. That is a self-serve wand wash, NOT a hand wash — set is_hand_wash=false.
  - FALSE also if it's an AUTOMATIC / TOUCHLESS in-bay or TUNNEL wash (machine/conveyor/overhead gantry washes the car), or purely a VACUUM lot, gas station, or unrelated business.
  - If genuinely ambiguous (no clear evidence either way), set is_hand_wash=true but needs_human=true.
  When is_hand_wash=false: set hero_index=null, gallery_indices=[], and STOP.

STEP 1 — (only if is_hand_wash) Score EVERY image (skip none). For each return: index, category (e.g. "attendant-washing","clean-car","facility","interior","sign","vacuum","other"), relevance (0-5, how well it depicts an attended hand wash), visual_quality (0-5), hero_worthy (0-5), disqualified (bool) + reason.

STEP 2 — Pick the HERO: the single most ATTRACTIVE, inviting image that ALSO shows the hand-wash in CONTEXT. The hero must NEVER be an ugly/dull/junky building or a context-less fragment. Prefer, in ROUGHLY THIS ORDER (pick the nicest actually-good option that exists in THIS set):
  1. An ATTENDANT actively hand-washing, foaming, wiping, or towel-drying a vehicle — an engaging human-action shot that shows this is a real attended hand wash. This is the STRONGEST hero and should WIN over a context-less clean-car shot whenever a decent one exists.
  2. A wide, attractive scene: cars being worked on under the canopy/bays, or an inviting, clean, well-lit facility/exterior that looks appealing.
  3. Only if neither exists: a FULL, glossy, beautifully-clean car shown WHOLE and well-composed in an attractive setting (the entire car in frame, nice light, tidy background).
  CRITICAL — DO NOT pick as hero (Michael flagged these as looking bad): a TIGHT CLOSE-UP or CROPPED FRAGMENT of a single car — its front end, hood, grille, headlight, wheel/rim, door, or a body panel — where the WHOLE car is not in frame, no attendant is present, and there's little or no facility context. These look amateurish and fail to show the wash, ESPECIALLY against a plain, wet, or grimy lot background. Such a shot may at most be a gallery image, NEVER the hero. If your best "clean car" candidate is a partial/close-up car, prefer an attendant-action or facility shot for the hero instead.
  REWARD: an attendant at work, good light, gloss/shine, a clear read of the wash, an inviting feel, the WHOLE subject in frame. PENALIZE HARD (never hero): a drab/run-down building, a messy/cluttered lot, dark/blurry/harsh shots, awkward angles, and any single-car close-up/fragment as described above.
  Always pick the best available; set hero_index=null + needs_human=true ONLY if nothing is usably attractive AND in-context.
  Also return hero_crop: fractions (0 to 0.4) to TRIM from each edge to isolate the subject and remove distractions (a pole, an adjacent building, empty sky/pavement). 0 for already-clean edges; keep the subject fully in frame. The image is later center-cropped to 16:9 within what remains.

STEP 3 — Pick GALLERY images (up to ${GALLERY_MAX}): a VARIED, attractive set. Aim for a spread: attendants washing/drying cars, one or more beautifully clean finished cars, and AT LEAST ONE facility/exterior shot so a visitor sees the place. DIVERSITY IS REQUIRED — no two gallery images may show the same car from the same angle or be near-interchangeable views of the same facade/sign; if several are near-duplicates keep only the single best. Every gallery image should have a DIFFERENT primary subject. Include as many genuinely good, DISTINCT shots as exist (up to ${GALLERY_MAX}); do not pad with weak filler.

NEVER pick as hero OR gallery: blurry, dark, low-res, watermarked, or stock images; car interiors/dashboards; gas pumps; maps; screenshots; menus; food/drinks; people portraits/selfies; graphics/flyers/posters/logos/coupons (only a plain photo of the wash's OWN name sign is OK, and only as a last-resort hero, never gallery); vacuum-equipment or vending close-ups; extreme close-ups of soap/water on paint with no car or facility context; tilted/crooked/dutch-angle shots.

Return ONLY JSON:
{"is_hand_wash":true,"images":[{"index":0,"category":"...","relevance":4,"visual_quality":4,"hero_worthy":5,"disqualified":false,"reason":"..."}],"hero_index":2,"hero_crop":{"trim_left":0,"trim_right":0.2,"trim_top":0.1,"trim_bottom":0},"gallery_indices":[4,1],"confidence":0.86,"needs_human":false,"reason":"one line: why these, or why not a hand wash"}`;
}

function triagePrompt() {
  return `Score each candidate photo for an ATTENDED HAND CAR WASH directory (staff wash cars by hand with mitts/sponges/cloths/foam/towels — hand contact is GOOD here, never penalize it). For EACH image return its index and score 0-5 (5 = an attractive, clear hand-wash scene: an attendant washing/drying a car, a beautifully clean finished car, or an inviting clean facility exterior; 0 = irrelevant/junk). Mark disqualified=true for: self-serve coin-op WAND BAYS (walled stalls with a wall wand + coin box and no staff — customer washes own car); automatic/tunnel washes; vacuum equipment or vending machines and their close-ups; car interiors; gas pumps; food; maps; screenshots; any graphic/flyer/poster/logo/coupon; extreme close-ups of soap/water on paint with no car or facility; tilted/crooked amateur-angle shots; blurry/dark/low-res. Return ONLY JSON: {"scores":[{"index":0,"score":4,"disqualified":false}]}`;
}

// ---- Street View fallback (same method as selfserve-autophoto) ----
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
    return buf.length < MIN_BYTES ? null : buf;
  } catch { return null; }
}

// ---- photo download / resize ----
// GLOBAL download limiter: Google rate-limits (429 / connection resets) when too many
// googleusercontent image fetches fire at once. With CONCURRENCY listings each holding a
// large gallery (Brighton had 95), an unbounded Promise.all burst throttled whole listings
// down to <2 usable photos → false "no photos". Cap total concurrent fetches at DL_LIMIT
// and retry once on failure.
const DL_LIMIT = parseInt(process.env.DL_LIMIT || '6', 10);
let _dlActive = 0; const _dlQueue = [];
function _dlGate() {
  return new Promise(resolve => {
    const run = () => { _dlActive++; resolve(() => { _dlActive--; const next = _dlQueue.shift(); if (next) next(); }); };
    if (_dlActive < DL_LIMIT) run(); else _dlQueue.push(run);
  });
}
const RESIZABLE = u => /googleusercontent\.com\/(?:gps-cs|geougc|p)/.test(u || '');
async function downloadUrl(url) {
  const base = url.split('=')[0];
  const fetchUrl = RESIZABLE(url) ? base + '=w1600' : url;
  const release = await _dlGate();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(fetchUrl, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
        if (!r.ok) { if (attempt === 0 && (r.status === 429 || r.status >= 500)) { await new Promise(res => setTimeout(res, 800)); continue; } return null; }
        const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(ct)) return null;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < MIN_BYTES || buf.length > 8_000_000) return null;
        return { buffer: buf, mediaType: ct, srcUrl: RESIZABLE(url) ? base : url };
      } catch { if (attempt === 0) { await new Promise(res => setTimeout(res, 800)); continue; } return null; }
    }
    return null;
  } finally { release(); }
}
async function hiResBuffer(img) {
  if (!img || !img.srcUrl || !RESIZABLE(img.srcUrl)) return img?.buffer;
  try {
    const r = await fetch(img.srcUrl + '=s0', { signal: AbortSignal.timeout(20000), redirect: 'follow' });
    if (!r.ok) return img.buffer;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < MIN_BYTES || buf.length > 25_000_000) return img.buffer;
    return await sharp(buf).resize(2560, 2560, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  } catch { return img.buffer; }
}
async function visionCopy(buffer, mediaType) {
  try { return { mediaType: 'image/jpeg', base64: (await sharp(buffer).resize(VISION_W, null, { withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()).toString('base64') }; }
  catch { return { mediaType, base64: buffer.toString('base64') }; }
}
async function thumbDataUri(buffer, w, q = 72) {
  try { const b = await sharp(buffer).resize(w, null, { withoutEnlargement: true }).jpeg({ quality: q }).toBuffer(); return `data:image/jpeg;base64,${b.toString('base64')}`; }
  catch { return null; }
}
async function cropHero(buffer, crop = {}) {
  try {
    const clamp = v => Math.min(Math.max(Number(v) || 0, 0), 0.4);
    const tl = clamp(crop.trim_left), tr = clamp(crop.trim_right), tt = clamp(crop.trim_top), tb = clamp(crop.trim_bottom);
    const m = await sharp(buffer).metadata();
    let x = Math.round(m.width * tl), y = Math.round(m.height * tt);
    let w = Math.round(m.width * (1 - tl - tr)), h = Math.round(m.height * (1 - tt - tb));
    const AR = 16 / 9;
    if (w / h > AR) { const nw = Math.round(h * AR); x += Math.round((w - nw) / 2); w = nw; }
    else { const nh = Math.round(w / AR); y += Math.round((h - nh) / 2); h = nh; }
    return await sharp(buffer).extract({ left: x, top: y, width: Math.max(16, w), height: Math.max(9, h) }).jpeg({ quality: 88 }).toBuffer();
  } catch { return buffer; }
}
async function upload(buffer, ct, listingId, slot) {
  const path = `${listingId}/ai-${slot}-${Date.now()}.${ct.split('/')[1].replace('jpeg', 'jpg')}`;
  const { error } = await sb.storage.from('listing-photos').upload(path, buffer, { contentType: ct, upsert: true });
  if (error) return null;
  return sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
}
const xj = s => { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b < 0) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };

async function callVision(model, content, maxTok, timeout) {
  const body = JSON.stringify({ model, max_tokens: maxTok, messages: [{ role: 'user', content }] });
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(timeout) });
      if (!res.ok) { if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 4000)); continue; } return { err: `${res.status}: ${(await res.text()).slice(0, 160)}` }; }
      const j = await res.json();
      return { parsed: xj((j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')), usage: j.usage };
    } catch (e) { if (a < 2) { await new Promise(r => setTimeout(r, 4000)); continue; } return { err: e?.message || 'fetch failed' }; }
  }
  return { err: 'exhausted retries' };
}
async function selectPhotos(name, vis) {
  const content = [{ type: 'text', text: `${rubric()}\n\nLocation: ${name}\nCandidates:` }];
  vis.forEach((g, i) => { content.push({ type: 'text', text: `Image ${i}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: g.mediaType, data: g.base64 } }); });
  return callVision(MODEL, content, 12000, 300000);
}
async function triageBatch(vis) {
  const content = [{ type: 'text', text: triagePrompt() }];
  vis.forEach((g, i) => { content.push({ type: 'text', text: `Image ${i}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: g.mediaType, data: g.base64 } }); });
  return callVision(TRIAGE_MODEL, content, 4000, 180000);
}
const BATCH = 16, SHORTLIST = 14;
async function analyzeAll(name, imgs) {
  let triageIn = 0, triageOut = 0;
  if (imgs.length <= BATCH + 6) {
    const vis = []; for (const g of imgs) vis.push(await visionCopy(g.buffer, g.mediaType));
    const r = await selectPhotos(name, vis);
    return { r, used: imgs, triageIn, triageOut };
  }
  const scores = [];
  for (let s = 0; s < imgs.length; s += BATCH) {
    const batch = imgs.slice(s, s + BATCH);
    const vis = []; for (const g of batch) vis.push(await visionCopy(g.buffer, g.mediaType));
    const t = await triageBatch(vis);
    triageIn += t.usage?.input_tokens || 0; triageOut += t.usage?.output_tokens || 0;
    for (const sc of (t.parsed?.scores || [])) if (!sc.disqualified && sc.index != null && batch[sc.index]) scores.push({ gi: s + sc.index, score: sc.score ?? 0 });
  }
  scores.sort((a, b) => b.score - a.score);
  const used = scores.slice(0, SHORTLIST).map(x => imgs[x.gi]);
  if (used.length < 2) return { r: { parsed: { is_hand_wash: false, reason: 'triage found no usable hand-wash photos' } }, used, triageIn, triageOut };
  const vis = []; for (const g of used) vis.push(await visionCopy(g.buffer, g.mediaType));
  const r = await selectPhotos(name, vis);
  return { r, used, triageIn, triageOut };
}

// ---- load inputs ----
const gallery = JSON.parse(readFileSync(GALLERY_FILE, 'utf8'));       // {listing_id:{title,match,urls[]}}
const meta = JSON.parse(readFileSync(META_FILE, 'utf8'));              // [{id,name,city,state,lat,lng,has_hero}]
const metaById = Object.fromEntries(meta.map(m => [m.id, m]));
const ids = Object.keys(gallery);
console.log(`Hand-wash ${APPLY ? 'APPLY' : 'VALIDATION'} pass: ${ids.length} listings, model ${MODEL}\n`);

let selIn = 0, selOut = 0, triageInTot = 0, triageOutTot = 0;
const results = [];
async function processOne(id) {
  const g = gallery[id], m = metaById[id] || {};
  const name = m.name || g.title || id;
  if (!g.match || !g.urls?.length) { results.push({ id, name, city: m.city, state: m.state, decision: 'no-photos', reason: g.match ? 'no gallery photos' : 'name mismatch (contamination guard)', hero: null, gallery: [], candidates: [] }); return; }
  const urls = g.urls.slice(0, MAX_PHOTOS);
  const imgs = (await Promise.all(urls.map(u => downloadUrl(u).catch(() => null)))).filter(Boolean);
  const sv = await streetViewImage(m.lat, m.lng);
  if (sv) imgs.push({ buffer: sv, mediaType: 'image/jpeg', isStreetView: true });
  if (imgs.length < 2) { results.push({ id, name, city: m.city, state: m.state, decision: 'no-photos', reason: `only ${imgs.length} downloadable photo(s)`, hero: null, gallery: [], candidates: [] }); return; }

  const { r, used, triageIn, triageOut } = await analyzeAll(name, imgs);
  triageInTot += triageIn; triageOutTot += triageOut;
  if (r.err) { results.push({ id, name, city: m.city, state: m.state, decision: 'error', reason: r.err, hero: null, gallery: [], candidates: [] }); return; }
  selIn += r.usage?.input_tokens || 0; selOut += r.usage?.output_tokens || 0;
  const p = r.parsed || {};

  // Build candidate thumbnails (from the finalists `used`, which the indices refer to).
  const scoreByIdx = Object.fromEntries((p.images || []).map(im => [im.index, im]));
  const candidates = [];
  for (let i = 0; i < used.length; i++) {
    const im = scoreByIdx[i] || {};
    candidates.push({ idx: i, isStreetView: !!used[i].isStreetView, thumb: await thumbDataUri(used[i].buffer, 150, 62), category: im.category, vq: im.visual_quality, hw: im.hero_worthy, disq: im.disqualified, reason: im.reason });
  }

  let decision, heroThumb = null, galleryThumbs = [];
  if (p.is_hand_wash === false) {
    decision = 'drop-not-handwash';
  } else {
    const heroImg = p.images?.find(x => x.index === p.hero_index);
    const heroUsable = p.hero_index != null && used[p.hero_index] && heroImg && !heroImg.disqualified;
    if (!heroUsable) { decision = 'needs-human'; }
    else {
      decision = p.needs_human ? 'needs-human' : 'keep';
      const heroBuf = await cropHero(used[p.hero_index].buffer, p.hero_crop || {});
      heroThumb = await thumbDataUri(heroBuf, 760, 80);
      const gal = (p.gallery_indices || []).filter(i => { if (i === p.hero_index || !used[i]) return false; const gi = scoreByIdx[i]; return gi && !gi.disqualified && (gi.visual_quality ?? 0) >= 3; }).slice(0, GALLERY_MAX);
      for (const gi of gal) galleryThumbs.push({ idx: gi, category: scoreByIdx[gi]?.category, thumb: await thumbDataUri(used[gi].buffer, 500, 76) });
    }
  }
  results.push({ id, name, city: m.city, state: m.state, decision, confidence: p.confidence, reason: p.reason, photoCount: imgs.length, finalists: used.length, hero: heroThumb, heroCrop: p.hero_crop, gallery: galleryThumbs, candidates });

  if (APPLY) await applyOne(id, m, p, used);
}

async function applyOne(id, m, p, used) {
  if (p.is_hand_wash === false && (p.confidence ?? 0) >= 0.6) {
    await sb.from('listings').update({ is_hand_wash: false, hand_wash_source: 'autophoto_not_handwash' }).eq('id', id);
    return;
  }
  const heroImg = p.images?.find(x => x.index === p.hero_index);
  const heroUsable = p.hero_index != null && used[p.hero_index] && heroImg && !heroImg.disqualified;
  if (!heroUsable) { await sb.from('listings').update({ hand_wash_source: 'autophoto_needs_human' }).eq('id', id); return; }
  const heroUrl = await upload(await cropHero(await hiResBuffer(used[p.hero_index]), p.hero_crop || {}), 'image/jpeg', id, 'hero');
  const gal = (p.gallery_indices || []).filter(i => { if (i === p.hero_index || !used[i]) return false; const gi = p.images?.find(x => x.index === i); return gi && !gi.disqualified && (gi.visual_quality ?? 0) >= 3; }).slice(0, GALLERY_MAX);
  const galUrls = [];
  for (const gi of gal) { const u = await upload(await hiResBuffer(used[gi]), 'image/jpeg', id, `g${gi}`); if (u) galUrls.push(u); }
  if (heroUrl) await sb.from('listings').update({ hero_image: heroUrl, hero_image_source: 'ai_photo', photos: galUrls.slice(0, 8), hand_wash_source: p.needs_human ? 'autophoto_needs_human' : 'autophoto_applied' }).eq('id', id);
}

let _n = 0;
async function worker() { while (_n < ids.length) { const id = ids[_n++]; try { await processOne(id); process.stdout.write('.'); } catch (e) { results.push({ id, name: metaById[id]?.name || id, decision: 'error', reason: e.message, hero: null, gallery: [], candidates: [] }); process.stdout.write('x'); } } }
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length || 1) }, worker));
console.log('\n');

// ---- cost ----
const selCost = (selIn / 1e6) * 3 + (selOut / 1e6) * 15;
const haikuTriage = /haiku/i.test(TRIAGE_MODEL);
const triageCost = (triageInTot / 1e6) * (haikuTriage ? 1 : 3) + (triageOutTot / 1e6) * (haikuTriage ? 5 : 15);
const cost = selCost + triageCost;
const perListing = ids.length ? cost / ids.length : 0;

// order results by input order
results.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
const badge = { keep: ['✅ HAND WASH — keep', '#16a34a'], 'drop-not-handwash': ['🚫 NOT a hand wash — drop', '#dc2626'], 'needs-human': ['⚠️ Needs human', '#d97706'], 'no-photos': ['📷 No usable photos', '#6b7280'], error: ['⚠️ Error', '#dc2626'] };
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
let html = `<!doctype html><meta charset=utf-8><title>Hand-wash vision — 10-listing validation</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f6f7f9;color:#111}
.wrap{max-width:1000px;margin:0 auto;padding:24px}
h1{font-size:22px}.sub{color:#555;font-size:14px;margin-bottom:20px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px;margin-bottom:22px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.hd{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px}
.nm{font-weight:700;font-size:17px}.loc{color:#666;font-weight:400;font-size:14px}
.bdg{font-weight:700;font-size:13px;padding:4px 10px;border-radius:999px;color:#fff}
.reason{font-size:13px;color:#444;margin:8px 0 14px;font-style:italic}
.hero img{width:100%;max-width:760px;border-radius:10px;display:block}
.lab{font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 6px}
.gal{display:flex;gap:8px;flex-wrap:wrap}.gal figure{margin:0}.gal img{height:130px;border-radius:8px;display:block}
.gal figcaption,.cand figcaption{font-size:10px;color:#888;text-align:center;margin-top:2px}
.cand{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.cand figure{margin:0;width:96px}
.cand img{width:96px;height:72px;object-fit:cover;border-radius:5px;display:block}
.cand .disq img{opacity:.32;outline:2px solid #dc2626}
details{margin-top:12px}summary{cursor:pointer;font-size:13px;color:#2563eb}
.meta{font-size:12px;color:#777;margin-top:4px}</style>
<div class=wrap><h1>Hand-wash vision pass — validation (10 listings)</h1>
<div class=sub>Full Google gallery harvested via your real Chrome (all photos, not the 10-cap) + Street View. Claude Sonnet classified each as attended-hand-wash vs self-serve, then picked a hero + gallery. <b>Nothing was written to the site</b> — this is for your eyes only. Est. cost this run: <b>$${cost.toFixed(2)}</b> (~$${perListing.toFixed(3)}/listing → ~$${(perListing * 417).toFixed(0)} for all ~417).</div>`;
for (const r of results) {
  const [label, color] = badge[r.decision] || ['?', '#333'];
  html += `<div class=card><div class=hd><div class=nm>${esc(r.name)} <span class=loc>${esc(r.city || '')}${r.state ? ', ' + esc(r.state) : ''}</span></div><span class=bdg style="background:${color}">${label}</span></div>`;
  if (r.reason) html += `<div class=reason>“${esc(r.reason)}”${r.confidence != null ? ` · confidence ${r.confidence}` : ''}</div>`;
  if (r.photoCount != null) html += `<div class=meta>${r.photoCount} photos harvested · ${r.finalists} finalists analyzed</div>`;
  if (r.hero) html += `<div class=lab>Chosen hero (16:9 crop preview)</div><div class=hero><img src="${r.hero}"></div>`;
  if (r.gallery?.length) { html += `<div class=lab>Gallery picks (${r.gallery.length})</div><div class=gal>`; for (const g of r.gallery) html += `<figure><img src="${g.thumb}"><figcaption>${esc(g.category || '')}</figcaption></figure>`; html += `</div>`; }
  if (r.candidates?.length) {
    html += `<details><summary>See all ${r.candidates.length} finalists the AI scored (red outline = disqualified)</summary><div class=cand>`;
    for (const c of r.candidates) html += `<figure class="${c.disq ? 'disq' : ''}"><img src="${c.thumb}" title="${esc(c.reason || '')}"><figcaption>${c.isStreetView ? 'StreetView' : esc(c.category || '')}${c.vq != null ? ` q${c.vq}` : ''}</figcaption></figure>`;
    html += `</div></details>`;
  }
  html += `</div>`;
}
html += `</div>`;
writeFileSync(HTML_OUT, html);

const counts = results.reduce((a, r) => { a[r.decision] = (a[r.decision] || 0) + 1; return a; }, {});
console.log('==================== HAND-WASH VALIDATION DONE ====================');
console.log('Decisions:', JSON.stringify(counts));
console.log(`Est. cost: $${cost.toFixed(2)} (select $${selCost.toFixed(2)} + triage $${triageCost.toFixed(2)}) → ~$${perListing.toFixed(3)}/listing → ~$${(perListing * 417).toFixed(0)} for ~417`);
console.log(`Review page: ${HTML_OUT}`);
