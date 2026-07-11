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
const MODEL = 'claude-sonnet-5';
const STATE = (process.argv[2] || 'CA').toUpperCase();
const LIMIT = parseInt(process.argv[3] || '12', 10);
const APPLY = process.argv.includes('--apply');
const MAX_PHOTOS = 8, PHOTO_W = 1280, MIN_BYTES = 5000, PROMOTE_CONF = 0.7;

function rubric(mixed) {
  return `You are the expert photo editor for a SELF-SERVICE car wash directory. You get up to ${MAX_PHOTOS} candidate photos (from the wash's Google listing) for ONE location. Pick the single best HERO and up to 3 GALLERY images. Accuracy and quality are paramount — it is far better to say needs_human than to pick a mediocre or wrong photo.

This location is: ${mixed ? 'MIXED (it is ALSO a touchless/automatic wash)' : 'SELF-SERVE ONLY'}.

Definitions:
- SELF-SERVE bay: an open/covered stall where the customer washes their own car with a handheld wand/lance; usually a coin/credit box, foam brush, hoses on the wall.
- FACILITY shot: the building / canopy / multiple bays seen from outside, framed so the wash is the clear subject.

HERO rules (choose exactly one index, or null if none is good):
${mixed
  ? `- Pick a FACILITY/exterior shot of the whole site (building + bays/canopy). DO NOT pick a close-up of an automatic/touchless bay interior or a tunnel interior — those misrepresent a mixed site. A clean wide exterior is ideal. Must be landscape (crops to 16:9).`
  : `- Prefer a clean FACILITY shot showing MULTIPLE self-serve bays (exterior/canopy). If none, use a clear, well-lit self-serve BAY shot (stall with wand/coin box, ideally a car being washed). Must be landscape (crops to 16:9).`}
- NEVER as hero: mostly-a-car photos, dashboards/interiors, gas pumps, sign/price/logo-only, maps/screenshots, food, people portraits, blurry/dark/low-res, watermarked/stock.

GALLERY rules (up to 3, excluding the hero): the best SELF-SERVE shots — bay interiors with wands/coin boxes, a car being washed in a bay, foam brush, clean stalls, vacuum stations. Prefer variety (no near-duplicates). Same quality bans.

For EACH candidate return: index, category (facility_multi_bay|bay_interior|bay_in_use|touchless_bay|tunnel_interior|vacuum|sign_or_price|vehicle|interior|gas|logo|map|person|food|other), quality (1-5), keep (bool), reason (short).

Return ONLY JSON:
{"images":[{"index":0,"category":"...","quality":3,"keep":true,"reason":"..."}],"hero_index":2,"gallery_indices":[4,1],"confidence":0.86,"needs_human":false,"reason":"..."}`;
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
  const heroOk = p.hero_index != null && imgs[p.hero_index] && (p.images?.find(x => x.index === p.hero_index)?.quality ?? 0) >= 3;
  const good = !p.needs_human && (p.confidence ?? 0) >= PROMOTE_CONF && heroOk;
  const gal = (p.gallery_indices || []).filter(i => i !== p.hero_index && imgs[i]).slice(0, 3);
  const tag = `${mixed ? '[mixed]' : '[self]'}`;

  if (!good) { flagged++; console.log(`• ${l.name} (${l.city}) ${tag} — ⚠ NEEDS HUMAN (conf ${p.confidence}, ${p.reason || ''})`); }
  else {
    console.log(`• ${l.name} (${l.city}) ${tag} — hero #${p.hero_index} (${p.images?.find(x => x.index === p.hero_index)?.category}), gallery [${gal.join(',')}] conf ${p.confidence}`);
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
const cost = (inTok / 1e6) * 3 + (outTok / 1e6) * 15 + photoCalls * 0.007; // Sonnet ~$3/$15 + Places ~$0.007/call
console.log(`\n==================== AUTOPHOTO ${STATE} DONE ====================`);
console.log(`${APPLY ? 'Applied' : 'Would apply'}: ${applied}  |  ⚠ Needs human: ${flagged}  |  too few photos: ${noPhotos}  |  errors: ${errors}`);
console.log(`Est. cost: ~$${cost.toFixed(2)} (${photoCalls} Google calls + Sonnet vision)`);
