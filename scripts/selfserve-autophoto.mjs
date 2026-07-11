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
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const AKEY = env.ANTHROPIC_API_KEY, GKEY = env.GOOGLE_PLACES_API_KEY;
const MODEL = 'claude-opus-4-8';
const STATE = (process.argv[2] || 'CA').toUpperCase();
const LIMIT = parseInt(process.argv[3] || '12', 10);
const APPLY = process.argv.includes('--apply');
const MAX_PHOTOS = 10, PHOTO_W = 1280, MIN_BYTES = 5000, PROMOTE_CONF = 0.7, MIN_HERO_SCORE = 4;

function rubric(mixed) {
  return `You are a meticulous ART DIRECTOR curating photos for a premium self-service car wash directory. Quality is EVERYTHING. Do NOT settle for the first acceptable shot — study EVERY candidate, then choose only the genuinely best. It is far better to pick fewer images (or say needs_human) than to include a mediocre, messy, or wrong one.

This location is: ${mixed ? 'MIXED — it is ALSO a touchless/automatic wash. Self-serve seekers will view this, so the photos MUST clearly show the self-serve side, never only the automatic bay.' : 'SELF-SERVE ONLY.'}

STEP 1 — Score EVERY image (do not skip any). For each give:
  - category: facility_multi_bay | facility_exterior | bay_interior | bay_in_use (car being washed by hand) | wand_or_coin_detail | vacuum | touchless_or_automatic_bay | tunnel_interior | brush_or_abrasive | sign_or_price | vehicle_only | car_interior | gas | logo | map | person | food | clutter_or_messy | equipment_no_context | other
  - self_serve_relevance (0-5): how clearly it shows the self-serve experience (open bays, wand, coin box, a car being hand-washed, the self-serve facility)
  - visual_quality (0-5): lighting, sharpness, composition, cleanliness of the SCENE, how attractive/inviting it looks
  - hero_worthy (0-5): would this make a beautiful, inviting hero that instantly says "self-service car wash"? A gorgeous, brightly-lit interior bay shot can score 5 here even if it is not a facility shot.
  - disqualified (bool) + reason.

STEP 2 — Select like an art director:
  - HERO = the ONE image with the best combination of visual_quality + hero_worthy + self_serve_relevance. It may be EITHER a facility/exterior shot OR a beautiful interior bay shot — choose whichever is truly the most attractive and self-serve-representative. Strongly prefer clean, bright, sharp, FRONT-ON framing where the bays are clearly visible; reject awkward angles that hide the bays, and reject anything with cars/clutter blocking the view. If NOTHING scores hero_worthy >= 4, set hero_index null and needs_human true.
  - GALLERY (up to 3, excluding the hero) = the next best DISTINCT, genuinely good self-serve shots (aim for variety: an interior bay, a wand/coin detail, a wide facility). Include FEWER rather than pad with weak shots. A gallery image must have visual_quality >= 3 and be self-serve-relevant.

ABSOLUTE DISQUALIFIERS — never choose as hero OR gallery:
  - ANY brush, cloth strip, mitter curtain, foam-pad, or abrasive contact equipment. This violates our paint-safety brand and is STRICTLY forbidden — even if the photo is otherwise nice.
  - For a MIXED site: a touchless/automatic in-bay or tunnel shot as the HERO (confuses self-serve seekers). Never let automatic-only imagery be the only thing shown.
  - Messy/cluttered scenes: towels draped on cars, cars blocking the bays, junk/hoses tangled in the foreground, random equipment close-ups with no context (e.g. a lone tube/hose).
  - A customer's car as the subject with no clear bay/facility context; car interiors/dashboards; gas pumps; sign/price/logo-only; maps; screenshots; food; people portraits; blurry, dark, low-res, watermarked, or stock images.

Return ONLY JSON:
{"images":[{"index":0,"category":"...","self_serve_relevance":4,"visual_quality":4,"hero_worthy":5,"disqualified":false,"reason":"..."}],"hero_index":2,"gallery_indices":[4,1],"confidence":0.86,"needs_human":false,"reason":"why these picks are the best of the set"}`;
}

async function photoRefs(placeId) {
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=photos&key=${GKEY}`, { signal: AbortSignal.timeout(12000) });
    const j = await r.json();
    return (j.result?.photos || []).slice(0, MAX_PHOTOS).map(p => p.photo_reference);
  } catch { return []; }
}
async function download(ref) {
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=${PHOTO_W}&photo_reference=${encodeURIComponent(ref)}&key=${GKEY}`, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < MIN_BYTES || buf.length > 8_000_000) return null;
    return { buffer: buf, base64: buf.toString('base64'), mediaType: ct };
  } catch { return null; }
}
async function upload(buffer, ct, listingId, slot) {
  const path = `${listingId}/ai-${slot}-${Date.now()}.${ct.split('/')[1].replace('jpeg', 'jpg')}`;
  const { error } = await sb.storage.from('listing-photos').upload(path, buffer, { contentType: ct, upsert: true });
  if (error) return null;
  return sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
}
const xj = s => { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b < 0) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };

async function selectPhotos(name, mixed, imgs) {
  const content = [{ type: 'text', text: `${rubric(mixed)}\n\nLocation: ${name}\nCandidates:` }];
  imgs.forEach((g, i) => { content.push({ type: 'text', text: `Image ${i}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: g.mediaType, data: g.base64 } }); });
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content }] }), signal: AbortSignal.timeout(60000) });
    if (!res.ok) return { err: `${res.status}: ${(await res.text()).slice(0, 160)}` };
    const j = await res.json();
    return { parsed: xj((j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')), usage: j.usage };
  } catch (e) { return { err: e?.message || 'fetch failed' }; }
}

// target listings
// SAFETY: exclude mixed (is_touchless) listings — those are LIVE touchless pages
// and overwriting their hero would change the live site. Self-serve-only listings
// have no live page (gated), so applying hero+gallery is risk-free. Mixed listings
// get a separate, careful policy (facility hero that improves both / gallery-only).
const { data: rows } = await sb.from('listings')
  .select('id, name, city, state, google_place_id, is_touchless, hero_image, photos')
  .eq('is_self_service', true).is('self_service_reviewed_at', null)
  .not('is_touchless', 'is', true)
  .eq('state', STATE).not('google_place_id', 'is', null)
  .order('city').limit(LIMIT);
console.log(`${STATE}: ${rows?.length || 0} listings to process (${APPLY ? 'APPLY' : 'DRY RUN'}), model ${MODEL}\n`);

let applied = 0, flagged = 0, noPhotos = 0, errors = 0, inTok = 0, outTok = 0, photoCalls = 0;
for (const l of rows || []) {
  const mixed = l.is_touchless === true;
  const refs = await photoRefs(l.google_place_id); photoCalls++;
  const imgs = [];
  for (const ref of refs) { const d = await download(ref); photoCalls++; if (d) imgs.push({ ...d, ref }); if (imgs.length >= MAX_PHOTOS) break; }
  if (imgs.length < 2) { noPhotos++; console.log(`• ${l.name} (${l.city}) — only ${imgs.length} usable photos, skipped`); continue; }

  const r = await selectPhotos(l.name, mixed, imgs);
  if (r.err) { errors++; console.log(`• ${l.name} — vision error ${r.err}`); continue; }
  inTok += r.usage?.input_tokens || 0; outTok += r.usage?.output_tokens || 0;
  const p = r.parsed || {};
  const heroImg = p.images?.find(x => x.index === p.hero_index);
  const heroOk = p.hero_index != null && imgs[p.hero_index] && heroImg && !heroImg.disqualified && (heroImg.hero_worthy ?? 0) >= MIN_HERO_SCORE;
  const good = !p.needs_human && (p.confidence ?? 0) >= PROMOTE_CONF && heroOk;
  // Gallery: only distinct, non-disqualified, decent-quality shots (no padding).
  const gal = (p.gallery_indices || []).filter(i => {
    if (i === p.hero_index || !imgs[i]) return false;
    const gi = p.images?.find(x => x.index === i);
    return gi && !gi.disqualified && (gi.visual_quality ?? 0) >= 3;
  }).slice(0, 3);
  const tag = `${mixed ? '[mixed]' : '[self]'}`;

  if (!good) { flagged++; console.log(`• ${l.name} (${l.city}) ${tag} — ⚠ NEEDS HUMAN (conf ${p.confidence}, ${p.reason || ''})`); }
  else {
    console.log(`• ${l.name} (${l.city}) ${tag} — hero #${p.hero_index} ${heroImg?.category} (hero_worthy ${heroImg?.hero_worthy}, quality ${heroImg?.visual_quality}), gallery [${gal.join(',')}] conf ${p.confidence}`);
    if (APPLY) {
      const heroUrl = await upload(imgs[p.hero_index].buffer, imgs[p.hero_index].mediaType, l.id, 'hero');
      const galUrls = [];
      for (const gi of gal) { const u = await upload(imgs[gi].buffer, imgs[gi].mediaType, l.id, `g${gi}`); if (u) galUrls.push(u); }
      if (heroUrl) {
        await sb.from('listings').update({ hero_image: heroUrl, hero_image_source: 'ai_photo', photos: galUrls }).eq('id', l.id);
        applied++;
      }
    } else applied++;
  }
}
const cost = (inTok / 1e6) * 5 + (outTok / 1e6) * 25 + photoCalls * 0.007; // Opus ~$5/$25 + Places ~$0.007/call
console.log(`\n==================== AUTOPHOTO ${STATE} DONE ====================`);
console.log(`${APPLY ? 'Applied' : 'Would apply'}: ${applied}  |  ⚠ Needs human: ${flagged}  |  too few photos: ${noPhotos}  |  errors: ${errors}`);
console.log(`Est. cost: ~$${cost.toFixed(2)} (${photoCalls} Google calls + Opus vision)`);
