/**
 * THE hero/gallery selector. Looks CLOSELY at EVERY available photo (all Google photos +
 * Street View), scores each one individually, and picks the best hero + best gallery.
 * If nothing is good enough, the listing is HELD — never published with junk.
 *
 * This replaces every earlier shortcut (montages, single proof-shots, blind Street View).
 * The failures it must not repeat, all caught by Michael:
 *   - a Street View of the BURGER KING next door  → is_facility=false → rejected
 *   - vacuum stations / a hand on a coin box       → low hero_score → never the hero
 *   - a wand on a dirty car, a mirror in the frame → low hero_score → never the hero
 * Street View is just another candidate: it wins only if it truly shows THIS wash and looks good.
 *
 * Per photo, Gemini returns:
 *   is_facility  — does this show THIS car wash / an auto-wash facility? (false = wrong
 *                  business, a restaurant/store, trees/road/empty lot, unrelated scene)
 *   shows        — facility_exterior | self_serve_bay | touchless_equip | car_wash_action |
 *                  vacuum | interior | sign | people | other
 *   hero_score   — 0-10 as a HERO. Clean, well-framed facility exterior or an appealing
 *                  wide shot scores high. Dirty-car close-ups, clutter, a mirror/trash in
 *                  frame, sign-only, interior-only, vacuum-only score low.
 *   quality      — ok | poor (blurry, dark, low-res, heavily obstructed)
 *
 * CLASSIFICATION GATE (added after Michael caught it): before picking a hero, check whether ANY
 * photo actually shows a self-serve wand bay OR a brushless touchless arch. If NONE does and we
 * looked at >=3 real photos, the listing is NOT self-serve/touchless (it's a tunnel/express/vacuum
 * lot like New Day) → is_self_service=false. A pretty building exterior is NOT proof of self-serve.
 * SAFETY: de-classify touches ONLY is_self_service — never is_approved or is_touchless.
 *
 * Hero (only for listings that PASS the gate) = highest hero_score among
 *        {is_facility && quality==ok && hero_score>=HERO_MIN}. None clear it → HELD, kept classified.
 * Gallery = next best distinct photos (different `shows`), quality ok, is_facility.
 *
 *   node scripts/selfserve-hero-select.mjs --self-test          # the exact cases he caught
 *   node scripts/selfserve-hero-select.mjs --limit 20           # dry run on the queue
 *   node scripts/selfserve-hero-select.mjs --limit 20 --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import sharp from 'sharp';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const GKEY = env.GEMINI_API_KEY, PKEY = env.GOOGLE_PLACES_API_KEY, SB_URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APPLY = process.argv.includes('--apply');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LIMIT = parseInt(arg('--limit', '20'), 10);
const HERO_MIN = 5;                     // a photo must be at least this attractive to be a hero.
// 5 = "plain but a real, clean facility shot" (e.g. a neutral Street View of the building) is
// acceptable — Michael confirmed a plain Street View beats junk. Below 5 (dirty-car close-ups=3,
// coin boxes=3) or is_facility=false (Burger King=0) never wins; those listings are HELD.
const sleep = ms => new Promise(r => setTimeout(r, ms));

const dl = async u => { for (let a = 0; a < 2; a++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(15000) }); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch {} await sleep(400); } return null; };
const b64 = async b => { try { return (await sharp(b).resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer()).toString('base64'); } catch { return null; } };
const bearing = (f, t) => { const R = d => d * Math.PI / 180, D = r => r * 180 / Math.PI;
  const y = Math.sin(R(t.lng - f.lng)) * Math.cos(R(t.lat));
  const x = Math.cos(R(f.lat)) * Math.sin(R(t.lat)) - Math.sin(R(f.lat)) * Math.cos(R(t.lat)) * Math.cos(R(t.lng - f.lng));
  return (D(Math.atan2(y, x)) + 360) % 360; };

// Full Maps gallery harvested by the browser (scripts/maps_gallery.py) — EVERY photo, not the
// Places API's 10. Keyed by listing id: { title, match, urls:[baseUrl,...] }.
let GALLERY = {};
try { GALLERY = JSON.parse(readFileSync('scripts/_gallery_urls.json', 'utf8')); } catch {}

// Every candidate photo: existing hero + FULL browser gallery (all photos) + Street View angles.
// Falls back to the Places API's 10 only when the browser harvest is missing for a listing.
async function gatherPhotos(l) {
  const cands = [];
  const seen = new Set();
  const add = (url, kind) => { if (url && !seen.has(url)) { seen.add(url); cands.push({ url, kind }); } };
  add(l.hero_image, 'existing');
  for (const u of (l.photos || [])) add(u, 'existing');
  const g = GALLERY[l.id];
  if (g && g.match && g.urls?.length) {
    // Browser-harvested full gallery. Base URLs need a size suffix; ask for hero-quality.
    for (const base of g.urls) add(`${base}=w1600-h1200`, 'gallery');
  } else if (l.google_place_id) {
    try { const r = await fetch(`${SB_URL}/functions/v1/google-place-photos?place_id=${l.google_place_id}&offset=0&limit=10&size=1600`, { headers: { Authorization: `Bearer ${ANON}` }, signal: AbortSignal.timeout(25000) });
      if (r.ok) { const j = await r.json(); for (const p of (j.photos || [])) add(p.url, 'google'); } } catch {}
  }
  // Street View: aim at the building; render two nearby headings so a slightly-off pano still
  // has a chance. These are just more candidates — Gemini rejects them if they're not the wash.
  if (l.latitude != null && l.longitude != null) {
    try { const r = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${l.latitude},${l.longitude}&source=outdoor&radius=120&key=${PKEY}`, { signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      if (j.status === 'OK') { const h = bearing(j.location, { lat: l.latitude, lng: l.longitude });
        for (const dh of [0, -25, 25]) add(`https://maps.googleapis.com/maps/api/streetview?size=1600x900&pano=${j.pano_id}&heading=${((h + dh + 360) % 360).toFixed(0)}&fov=78&pitch=2&key=${PKEY}`, 'streetview'); }
    } catch {}
  }
  // Score up to 30 photos/listing (full galleries can be 40+; 30 is comprehensive but bounds
  // Gemini calls). Existing hero + street view are already near the front of the list.
  return cands.slice(0, 30);
}

const SCORE_PROMPT = (name) => `You are picking the HERO photo for "${name}" on a TOUCHLESS and SELF-SERVE car wash directory. This directory is for washes with NO brushes (touchless automatic) and DIY wand bays (self-serve). Judge ONLY this one image.
Return strict JSON: {"is_facility":true|false,"shows":"facility_exterior|self_serve_bay|touchless_equip|friction_tunnel|car_wash_action|vacuum|interior|sign|people|other","hero_score":0-10,"quality":"ok|poor","note":"<=8 words"}

is_facility = false if the image is a DIFFERENT business (a restaurant like Burger King, a store), just trees/road/an empty lot, an unrelated scene, or clearly not this car wash.

=== CRITICAL: VACUUM STATION vs SELF-SERVE WASH BAY (the most common mistake — read carefully) ===
These look similar but are OPPOSITE. Study the equipment, not the car:
 - A VACUUM STATION is an open PARKING stall (flat lot, painted lines) with tall posts or arches overhead, often under a fabric SHADE CANOPY, holding thick CORRUGATED SUCTION HOSES (usually black, or hanging from green/painted arms). There is NO high-pressure spray wand. Cars park here to vacuum AFTER washing. This is shows="vacuum", hero_score <= 2. If you see green arms/arches with hanging hoses over open parking under a canopy → it is VACUUMS, not a bay.
 - A SELF-SERVE WASH BAY is an enclosed or 3-walled STALL (concrete/painted walls on the sides, a roof), with a swing-arm boom holding a metal high-pressure SPRAY WAND/LANCE and usually a coin/token box or a function selector dial (RINSE/SOAP/WAX) on the wall. Walls + wand + selector = a real bay. shows="self_serve_bay".
If you are not clearly seeing side WALLS and a spray WAND/LANCE, it is NOT a self_serve_bay. When unsure between vacuum and bay, call it "vacuum".

=== CRITICAL: the HERO must show the FACILITY, not one customer's car ===
A glamour shot whose SUBJECT is a single shiny customer car (the car fills the frame, taken to show off the car) is a POOR hero even if it was taken at this wash. shows="car_wash_action" or "other", hero_score <= 4. We want the BAYS / building / equipment as the subject, not somebody's car.

CRITICAL wash-type rule: if the image shows spinning CLOTH or FOAM BRUSHES, curtains, or wraps TOUCHING a car — that is a FRICTION / automatic TUNNEL wash, the OPPOSITE of what this directory lists. Set shows="friction_tunnel" and hero_score <= 2, no matter how pretty or well-lit it is. We must never headline a self-serve/touchless listing with a brushes-on-car photo.

hero_score (for an APPROPRIATE image whose SUBJECT is the facility — a clean building/bays exterior, a self-serve wand bay with walls+wand, or brushless touchless arch/equipment):
  8-10 = clean, well-framed facility exterior showing the wash bays/building; OR a clear self-serve wand bay (walls + spray wand visible); OR a brushless touchless arch. The FACILITY is the subject.
  4-7  = shows the facility but average — plain, partial, cluttered, or a car is partly the subject.
  0-3  = vacuum station (rule above), single-car glamour shot, friction/brush tunnel, dirty-car close-up, mirror/trash/pole in frame, coin-box or control-panel close-up, bare sign, interior-only, blurry/dark.
quality = poor if blurry, dark, low-res, or heavily obstructed.
Be honest and strict. A weak, honest score is far better than calling a vacuum or a car photo a "bay".`;

let calls = 0;
async function score(imgB64, name) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GKEY}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: SCORE_PROMPT(name) }, { inline_data: { mime_type: 'image/jpeg', data: imgB64 } }] }], generationConfig: { thinkingConfig: { thinkingBudget: 0 }, temperature: 0, responseMimeType: 'application/json' } }) });
      if (r.status === 429 || r.status >= 500) { await sleep(Math.min(2 ** a * 3, 30) * 1000); continue; }
      calls++;
      const j = await r.json();
      const t = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const s = t.indexOf('{'), e = t.lastIndexOf('}');
      if (s < 0) { await sleep(500); continue; }
      try { return JSON.parse(t.slice(s, e + 1)); } catch { await sleep(500); }
    } catch { await sleep(1000 * (a + 1)); }
  }
  return null;
}

async function selectFor(l) {
  const cands = await gatherPhotos(l);
  if (!cands.length) return { verdict: 'no_photos' };
  const scored = [];
  for (const c of cands) {
    const buf = await dl(c.url); if (!buf) continue;
    const s = await b64(buf); if (!s) continue;
    const v = await score(s, l.name); await sleep(120);
    if (v) scored.push({ ...c, buf, ...v });
  }
  // The classification GATE: does ANY photo actually show a self-serve wand bay OR a brushless
  // touchless arch? That — not "did we find a pretty photo" — is what qualifies a listing for
  // this directory. A gorgeous building exterior is NOT proof of self-serve (New Day has a lovely
  // exterior and is a friction TUNNEL). This is the exact judgment Michael makes by hand.
  const facilityCount = scored.filter(x => x.is_facility).length;
  const evidence = scored.filter(x => x.is_facility && x.quality === 'ok' && (x.shows === 'self_serve_bay' || x.shows === 'touchless_equip'));
  if (!evidence.length) {
    // No bay, no brushless arch anywhere. If we actually looked at a real set of photos, this is
    // NOT a self-serve/touchless wash (it's a tunnel/express/vacuum lot). De-classify — set
    // is_self_service=false. SAFETY: the apply step touches ONLY is_self_service, never
    // is_approved or is_touchless, so genuine touchless/mixed listings are never pulled offline.
    if (facilityCount >= 3) return { verdict: 'not_selfserve', scored };
    // Too few photos to be sure → don't de-classify on thin evidence; hold for a human.
    return { verdict: 'no_evidence_few_photos', scored };
  }
  const usable = scored.filter(x => x.is_facility && x.quality === 'ok');
  if (!usable.length) return { verdict: 'no_facility_photo', scored };
  usable.sort((a, b) => (b.hero_score || 0) - (a.hero_score || 0));
  const hero = usable[0];
  if ((hero.hero_score || 0) < HERO_MIN) return { verdict: 'no_good_hero', scored, best: hero };
  // Gallery: next best, one per distinct `shows`, up to 5.
  const gallery = []; const usedShows = new Set([hero.shows]);
  for (const x of usable.slice(1)) { if (gallery.length >= 5) break; if (usedShows.has(x.shows)) continue; usedShows.add(x.shows); gallery.push(x); }
  // top up if we still have room, ignoring the distinct rule
  for (const x of usable.slice(1)) { if (gallery.length >= 5) break; if (x === hero || gallery.includes(x)) continue; gallery.push(x); }
  return { verdict: 'HERO_SELECTED', hero, gallery, scored };
}

async function hostHero(buf, id) {
  try { const o = await sharp(buf).resize(1600, 900, { fit: 'cover', position: 'centre' }).jpeg({ quality: 87 }).toBuffer();
    const path = `heroes/${id}-best-${Date.now()}.jpg`;
    const { error } = await sb.storage.from('listing-photos').upload(path, o, { contentType: 'image/jpeg', upsert: true });
    return error ? null : sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
  } catch { return null; }
}
async function hostGallery(buf, id, i) {
  try { const o = await sharp(buf).resize(1200, 900, { fit: 'inside' }).jpeg({ quality: 84 }).toBuffer();
    const path = `gallery/${id}-${i}-${Date.now()}.jpg`;
    const { error } = await sb.storage.from('listing-photos').upload(path, o, { contentType: 'image/jpeg', upsert: true });
    return error ? null : sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
  } catch { return null; }
}

async function loadTargets() {
  if (process.argv.includes('--self-test')) {
    const names = [['New Day Car Wash', 'AL'], ['Northstar Laserwash%', 'AK'], ['Liberty Wash%', 'AR'], ['Sparkle Carwash', 'AR']];
    const out = [];
    for (const [n, s] of names) { const { data } = await sb.from('listings').select('id,name,city,state,hero_image,hero_image_source,photos,google_place_id,latitude,longitude').ilike('name', n).eq('state', s).limit(1); if (data?.[0]) out.push(data[0]); }
    return out;
  }
  // Targeted mode: --ids id1,id2,... (for focused end-to-end tests).
  const idsArg = arg('--ids', '');
  if (idsArg) {
    const ids = idsArg.split(',').map(s => s.trim()).filter(Boolean);
    const { data } = await sb.from('listings').select('id,name,city,state,hero_image,hero_image_source,photos,google_place_id,latitude,longitude').in('id', ids);
    return data || [];
  }
  // Re-run over the ones already hero-selected (to apply the friction-brush rule), plus any
  // still on the original source. NOTE: photos now hold the SELECTED gallery — but we also want
  // the full candidate pool, so gatherPhotos re-fetches Places + Street View fresh each time.
  const SRC = arg('--source', 'ai_hero_selected');
  let rows = [];
  for (let p = 0; ; p++) {
    let data = null, error = null;
    for (let a = 0; a < 5 && data === null; a++) {   // retry: Supabase intermittently returns null
      const r = await sb.from('listings').select('id,name,city,state,hero_image,hero_image_source,photos,google_place_id,latitude,longitude')
        .eq('self_service_source', SRC).order('id').range(p * 200, p * 200 + 199);
      data = r.data; error = r.error;
      if (data === null) await new Promise(x => setTimeout(x, 1200));
    }
    if (error) { console.error('⛔ loadTargets:', error.message); process.exit(1); }
    if (!data?.length) break; rows.push(...data); if (data.length < 200) break;
  }
  return rows.slice(0, LIMIT);
}

const targets = await loadTargets();
console.log(`Hero selector — ${targets.length} listings | HERO_MIN=${HERO_MIN} | ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
// NEVER touch a hero a human chose. Curated listings are skipped ENTIRELY — no re-scoring,
// no hero overwrite, no de-classify — because the human's pick/classification stands. This is
// the guard protecting Michael's ~1,396 manual heroes (feedback_no_night_jobs_no_vision_rescreen).
const CURATED = new Set(['manual', 'upload', 'pasted', 'chain-brand', 'chain-brand-auto', 'text-verified-pick']);
const out = { HERO_SELECTED: [], not_selfserve: [], no_good_hero: [], no_facility_photo: [], no_evidence_few_photos: [], no_photos: [], curated_skipped: [] };
for (const l of targets) {
  if (CURATED.has(l.hero_image_source)) {
    out.curated_skipped.push(l.name);
    console.log(`•  ${l.name} (${l.city}, ${l.state}) — curated hero (${l.hero_image_source}), left untouched`);
    continue;
  }
  const r = await selectFor(l);
  out[r.verdict] = out[r.verdict] || []; out[r.verdict].push(l.name);
  const nPhotos = (r.scored || []).length;
  if (r.verdict === 'HERO_SELECTED') {
    console.log(`✅ ${l.name} (${l.city}, ${l.state}) — hero: ${r.hero.shows} score ${r.hero.hero_score} [${r.hero.kind}] "${r.hero.note}" | +${r.gallery.length} gallery`);
    if (APPLY) {
      const hUrl = await hostHero(r.hero.buf, l.id);
      const gUrls = []; let gi = 0; for (const g of r.gallery) { const u = await hostGallery(g.buf, l.id, gi++); if (u) gUrls.push(u); }
      if (hUrl) await sb.from('listings').update({ hero_image: hUrl, hero_image_source: 'ai_best', photos: gUrls, self_service_source: 'ai_hero_selected' }).eq('id', l.id);
    }
  } else if (r.verdict === 'not_selfserve') {
    console.log(`✗  ${l.name} (${l.city}, ${l.state}) — NO self-serve bay / touchless arch in any of ${nPhotos} photos → NOT SELF-SERVICE (de-classified)`);
    // De-classify exactly as a human would. SAFETY: touch ONLY is_self_service — never
    // is_approved or is_touchless. A live touchless/mixed listing stays live and touchless;
    // this just says "it is not ALSO a self-serve wash". These are pre-launch (is_approved=false).
    if (APPLY) await sb.from('listings').update({ is_self_service: false, self_service_source: 'vision_no_selfserve_evidence' }).eq('id', l.id);
  } else {
    console.log(`·  ${l.name} (${l.city}, ${l.state}) — ${r.verdict}${r.best ? ` (best only ${r.best.hero_score}: ${r.best.note})` : ''} → HELD (kept classified, needs a human hero)`);
    // HELD but KEPT self-serve: it has bay/touchless evidence (or too few photos to judge) but no
    // attractive hero. Don't de-classify, don't touch is_approved. Human picks a hero.
    if (APPLY) await sb.from('listings').update({ self_service_source: 'ai_no_good_photo' }).eq('id', l.id);
  }
}
console.log(`\n==================== HERO SELECT ${APPLY ? 'APPLIED' : 'DRY RUN'} ====================`);
console.log(`✅ good hero chosen ................... ${out.HERO_SELECTED.length}`);
console.log(`✗  NO bay/arch in any photo → NOT self-serve (de-classified): ${(out.not_selfserve || []).length}`);
console.log(`·  has evidence but no good hero → HELD (kept): ${(out.no_good_hero || []).length + (out.no_facility_photo || []).length + (out.no_evidence_few_photos || []).length + (out.no_photos || []).length}`);
console.log(`•  curated hero, left untouched ....... ${(out.curated_skipped || []).length}`);
console.log(`Gemini photo-scoring calls: ${calls}`);
