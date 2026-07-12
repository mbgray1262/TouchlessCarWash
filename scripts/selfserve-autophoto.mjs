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
import sharp from 'sharp';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const AKEY = env.ANTHROPIC_API_KEY, GKEY = env.GOOGLE_PLACES_API_KEY;
const MODEL = 'claude-sonnet-5'; // tasteful enough for selection at a fraction of Opus cost
const STATE = (process.argv[2] || 'CA').toUpperCase();
const LIMIT = parseInt(process.argv[3] || '12', 10);
const APPLY = process.argv.includes('--apply');
const MAX_PHOTOS = 6, PHOTO_W = 1024, MIN_BYTES = 5000, PROMOTE_CONF = 0.5, MIN_HERO_SCORE = 3;

function rubric(mixed) {
  return `You are a skilled photo editor curating images for a self-service car wash directory.

This location is: ${mixed ? 'MIXED — it is ALSO a touchless/automatic wash. Self-serve seekers view this page, so the imagery MUST clearly show the self-serve side, never only the automatic bay.' : 'SELF-SERVE ONLY.'}

WHAT A SELF-SERVE WASH BAY IS (read carefully): an enclosed or partly-walled STALL a customer drives INTO and washes their own car with a HAND WAND / lance (a spray gun on a hose), usually with a per-bay coin/credit box and a foam brush; often "SELF SERVE"/"WASH" signage on the stall. A facility/exterior photo that clearly shows these wash-bay stalls counts too.
DO NOT confuse a wash bay with:
  - VACUUM / DETAIL areas: OPEN canopies over open parking spaces where cars park side-by-side to vacuum or hand-detail (vacuum hoses on posts, people around parked cars, NO enclosed wash stalls, NO spray wands). These are NOT self-serve wash bays.
  - Automatic / touchless in-bay washes, or tunnel washes.

STEP 0 — VERIFY FIRST: does AT LEAST ONE photo clearly show a genuine self-serve WASH BAY (or a facility view of the wash-bay stalls)? If YES, set has_self_serve_bay=true and continue. If NO photo shows a real self-serve wash bay — even if there are vacuum canopies, an automatic/tunnel wash, or only signage/exterior — set has_self_serve_bay=false, hero_index=null, gallery_indices=[] and STOP (do not pick a hero or gallery).

STEP 1 — (only if has_self_serve_bay) Score EVERY image (skip none). For each: category, self_serve_relevance (0-5), visual_quality (0-5), hero_worthy (0-5), disqualified (bool) + reason.

STEP 2 — Pick the HERO: the single most ATTRACTIVE and INFORMATIVE image — one that both looks genuinely nice to a typical visitor AND clearly shows what this self-serve wash looks like. Make a BALANCED, tasteful judgment; do NOT mechanically prefer one type. A great hero can be ANY of these — pick whichever is actually the nicest of THIS set:
  - a beautifully-lit facility/exterior clearly showing the open self-serve bays (warm golden light or bright even light) — these are OFTEN the best heroes
  - a clean car in a bright, well-lit self-serve bay
  - a clear, well-composed wide shot of the bays
  REWARD: good natural light, clean composition, a clear read of the self-serve bays, sharpness, an inviting feel. PENALIZE: dark/harsh/blown-out light, awkward angles that hide the bays, clutter, or a frame dominated by a single car with little context. Between two decent options, choose the one a typical person would find more attractive.
  Always pick the best available; set hero_index null / needs_human true ONLY if nothing usably shows the self-serve wash.

STEP 3 — Pick up to 3 GALLERY images (here BE PICKY): genuine, attractive self-serve SCENES only — interior bays, a car being hand-washed, a bright wide facility, an appealing wand-in-use shot. Aim for variety. RETURN FEWER (even zero) RATHER THAN PAD with weak or useless shots.

NEVER pick as hero OR gallery:
  - ANY brush, cloth strip, mitter curtain, foam-pad, or abrasive contact equipment — STRICTLY forbidden (violates our paint-safety brand), even if otherwise nice.
  - Messy/cluttered: towels on cars, cars blocking the bays, tangled hoses in the foreground, junk in frame.
  - For a MIXED site: an automatic/touchless in-bay or tunnel shot as the hero; never let automatic-only be the only imagery.
  - A customer's car with no bay/facility context; car interiors/dashboards; gas pumps; maps; screenshots; food; people portraits; blurry, very dark, low-res, watermarked, or stock.

NEVER pick as GALLERY (these are fine to note but are useless filler — reject them from the gallery): a shot whose only value is the building name/sign on a wall; a close-up of a payment/coin/token machine; a bare vacuum canister or a lone hose/tube; empty pavement. (These may still be acceptable as a last-resort HERO only if truly nothing better exists — but never as gallery.)

Return ONLY JSON:
{"has_self_serve_bay":true,"images":[{"index":0,"category":"...","self_serve_relevance":4,"visual_quality":4,"hero_worthy":5,"disqualified":false,"reason":"..."}],"hero_index":2,"gallery_indices":[4,1],"confidence":0.86,"needs_human":false,"reason":"why these are the best of the set"}`;
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
// Center-crop the hero to 16:9 so it displays cleanly (gallery images keep their
// natural orientation). Falls back to the original buffer if anything goes wrong.
async function cropHero16x9(buffer) {
  try {
    const m = await sharp(buffer).metadata();
    const AR = 16 / 9; let cw = m.width, ch = m.height, left = 0, top = 0;
    if (m.width / m.height > AR) { cw = Math.round(m.height * AR); left = Math.round((m.width - cw) / 2); }
    else { ch = Math.round(m.width / AR); top = Math.round((m.height - ch) / 2); }
    return await sharp(buffer).extract({ left, top, width: cw, height: ch }).jpeg({ quality: 85 }).toBuffer();
  } catch { return buffer; }
}
const xj = s => { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b < 0) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };

async function selectPhotos(name, mixed, imgs) {
  const content = [{ type: 'text', text: `${rubric(mixed)}\n\nLocation: ${name}\nCandidates:` }];
  imgs.forEach((g, i) => { content.push({ type: 'text', text: `Image ${i}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: g.mediaType, data: g.base64 } }); });
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, max_tokens: 3500, messages: [{ role: 'user', content }] }), signal: AbortSignal.timeout(90000) });
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
let rows = [];
for (let attempt = 0; attempt < 3; attempt++) {
  const res = await sb.from('listings')
    .select('id, name, city, state, google_place_id, is_touchless, hero_image, photos')
    .eq('is_self_service', true).is('self_service_reviewed_at', null)
    .not('is_touchless', 'is', true)
    // Skip closed washes (manually-closed via classification_source, or Google-closed
    // via business_status). The .is.null clauses keep listings with no such flag.
    .or('classification_source.is.null,classification_source.not.ilike.closed*')
    .or('business_status.is.null,business_status.not.in.(CLOSED_PERMANENTLY,CLOSED_TEMPORARILY)')
    .eq('state', STATE).not('google_place_id', 'is', null)
    .order('city').limit(LIMIT);
  if (!res.error && res.data) { rows = res.data; break; } // empty array is valid; retry only on error/null
  await new Promise(r => setTimeout(r, 1500));
}
console.log(`${STATE}: ${rows?.length || 0} listings to process (${APPLY ? 'APPLY' : 'DRY RUN'}), model ${MODEL}\n`);

let applied = 0, flagged = 0, noPhotos = 0, errors = 0, demoted = 0, inTok = 0, outTok = 0, photoCalls = 0;
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
  // VERIFY (Michael's rule): if NO photo shows a genuine self-serve wash bay, this
  // isn't a self-serve wash — demote it so it never reaches the review queue.
  if (p.has_self_serve_bay === false) {
    demoted++;
    console.log(`• ${l.name} (${l.city}) — ❌ NOT SELF-SERVE (no wash bay in any photo) — demoted`);
    if (APPLY) await sb.from('listings').update({ is_self_service: false, self_service_source: 'autophoto_not_selfserve' }).eq('id', l.id);
    continue;
  }
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
      const heroUrl = await upload(await cropHero16x9(imgs[p.hero_index].buffer), 'image/jpeg', l.id, 'hero');
      const galUrls = [];
      for (const gi of gal) { const u = await upload(imgs[gi].buffer, imgs[gi].mediaType, l.id, `g${gi}`); if (u) galUrls.push(u); }
      if (heroUrl) {
        await sb.from('listings').update({ hero_image: heroUrl, hero_image_source: 'ai_photo', photos: galUrls }).eq('id', l.id);
        applied++;
      }
    } else applied++;
  }
}
const cost = (inTok / 1e6) * 3 + (outTok / 1e6) * 15 + photoCalls * 0.007; // Sonnet ~$3/$15 + Places ~$0.007/call
console.log(`\n==================== AUTOPHOTO ${STATE} DONE ====================`);
console.log(`${APPLY ? 'Applied' : 'Would apply'}: ${applied}  |  ❌ Not self-serve (demoted): ${demoted}  |  ⚠ Needs human: ${flagged}  |  too few photos: ${noPhotos}  |  errors: ${errors}`);
console.log(`Est. cost: ~$${cost.toFixed(2)} (${photoCalls} Google calls + Sonnet vision)`);
