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
 * Hero = highest hero_score among {is_facility && quality==ok && hero_score>=HERO_MIN}.
 *        None clear HERO_MIN → HELD (hero left, source flagged).
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

// Every candidate photo: existing hero + gallery + up to 10 Places photos + Street View angles.
async function gatherPhotos(l) {
  const cands = [];
  const seen = new Set();
  const add = (url, kind) => { if (url && !seen.has(url)) { seen.add(url); cands.push({ url, kind }); } };
  add(l.hero_image, 'existing');
  for (const u of (l.photos || [])) add(u, 'existing');
  if (l.google_place_id) {
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
  return cands.slice(0, 16);
}

const SCORE_PROMPT = (name) => `You are picking the HERO photo for the car wash listing "${name}" on a directory site. Judge ONLY this one image.
Return strict JSON: {"is_facility":true|false,"shows":"facility_exterior|self_serve_bay|touchless_equip|car_wash_action|vacuum|interior|sign|people|other","hero_score":0-10,"quality":"ok|poor","note":"<=8 words"}

is_facility = false if the image is a DIFFERENT business (e.g. a restaurant like Burger King, a store), just trees/road/an empty lot, an unrelated scene, or clearly not this car wash. Only true if it plausibly shows THIS car wash or its grounds/equipment.
hero_score (attractiveness as the main image a visitor sees first):
  8-10 = clean, well-framed facility exterior, or an appealing wide shot of the wash; a clean nice car mid-wash is good.
  4-7  = shows the facility but average — some clutter, plain, or partial.
  0-3  = dirty-car close-up, a mirror/trash/pole in the frame, a coin box or control panel close-up, a bare sign, an interior-only shot, a vacuum-only shot, blurry/dark.
quality = poor if blurry, dark, low-res, or heavily obstructed.
Be honest and strict — a mediocre shot is not an 8.`;

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
    for (const [n, s] of names) { const { data } = await sb.from('listings').select('id,name,city,state,hero_image,photos,google_place_id,latitude,longitude').ilike('name', n).eq('state', s).limit(1); if (data?.[0]) out.push(data[0]); }
    return out;
  }
  let rows = [];
  for (let p = 0; ; p++) {
    const { data } = await sb.from('listings').select('id,name,city,state,hero_image,photos,google_place_id,latitude,longitude')
      .eq('self_service_source', 'gemini_bay_confirmed').order('id').range(p * 200, p * 200 + 199);
    if (!data?.length) break; rows.push(...data); if (data.length < 200) break;
  }
  return rows.slice(0, LIMIT);
}

const targets = await loadTargets();
console.log(`Hero selector — ${targets.length} listings | HERO_MIN=${HERO_MIN} | ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
const out = { HERO_SELECTED: [], no_good_hero: [], no_facility_photo: [], no_photos: [] };
for (const l of targets) {
  const r = await selectFor(l);
  out[r.verdict] = out[r.verdict] || []; out[r.verdict].push(l.name);
  if (r.verdict === 'HERO_SELECTED') {
    console.log(`✅ ${l.name} (${l.city}, ${l.state}) — hero: ${r.hero.shows} score ${r.hero.hero_score} [${r.hero.kind}] "${r.hero.note}" | +${r.gallery.length} gallery`);
    if (APPLY) {
      const hUrl = await hostHero(r.hero.buf, l.id);
      const gUrls = []; let gi = 0; for (const g of r.gallery) { const u = await hostGallery(g.buf, l.id, gi++); if (u) gUrls.push(u); }
      if (hUrl) await sb.from('listings').update({ hero_image: hUrl, hero_image_source: 'ai_best', photos: gUrls, self_service_source: 'ai_hero_selected' }).eq('id', l.id);
    }
  } else {
    console.log(`·  ${l.name} (${l.city}, ${l.state}) — ${r.verdict}${r.best ? ` (best only ${r.best.hero_score}: ${r.best.note})` : ''} → HELD (no good self-serve hero)`);
    // HELD = don't surface as a self-serve candidate. Do NOT touch is_approved — many of these
    // are ALSO live touchless listings, and setting is_approved=false would pull them from the
    // touchless directory (the exact collateral damage from earlier today). Just flag the source.
    if (APPLY) await sb.from('listings').update({ self_service_source: 'ai_no_good_photo' }).eq('id', l.id);
  }
}
writeFileSync(`scripts/_hero_select_${Date.now()}.json`, JSON.stringify(out, null, 2));
console.log(`\n==================== HERO SELECT ${APPLY ? 'APPLIED' : 'DRY RUN'} ====================`);
console.log(`✅ good hero chosen ...... ${out.HERO_SELECTED.length}`);
console.log(`·  no photo good enough → HELD: ${(out.no_good_hero || []).length + (out.no_facility_photo || []).length + (out.no_photos || []).length}`);
console.log(`Gemini photo-scoring calls: ${calls}`);
