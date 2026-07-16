/**
 * Conservative self-serve verifier — Gemini vision + a required second signal.
 *
 * The whole lesson from the mess: a vision model (Claude OR Gemini) confidently mislabels
 * vacuum stations / tunnels / attendant shots as "self-serve bays" on ambiguous photos. So we
 * do NOT trust one model on one photo. A listing is confirmed self-serve ONLY when:
 *
 *   (A) Gemini sees a CLEAR self-serve wand bay in a real photo (confidence >= 0.80), AND
 *   (B) an INDEPENDENT signal agrees — "self serv"/"coin" in the name, OR >=2 customer
 *       review snippets mentioning wands/coin/bays (from the harvest).
 *
 * No montages (the montage is what stitched a tunnel to vacuums). Each photo judged on its own.
 * When the photo is ambiguous or (A) and (B) don't both hold → the listing is left OUT. Fewer,
 * but ones we can stand behind. Nothing is published; this only sets is_self_service + a hero
 * candidate and leaves it in the queue for a final human glance.
 *
 *   node scripts/selfserve-gemini-verify.mjs --limit 20            # dry run, report only
 *   node scripts/selfserve-gemini-verify.mjs --limit 20 --apply
 *   node scripts/selfserve-gemini-verify.mjs --self-test           # the known good/bad cases
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
const LIMIT = parseInt(arg('--limit', '25'), 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BAY_PROMPT = `You verify photos for a SELF-SERVE car wash directory. Look ONLY at this one image.
A SELF-SERVE WASH BAY = an open/covered stall where the CUSTOMER holds a high-pressure spray WAND or foam brush and washes their own car. A coin/token/timer box on a post is strong confirmation.
These do NOT count and must return false:
 - VACUUM stations (arches or posts with suction hoses over open parking, no spray wand)
 - an AUTOMATIC tunnel or in-bay arch/gantry that moves over the car
 - ATTENDANTS washing or drying cars by hand
 - just a building exterior, sign, or entrance with no bay actually visible
Be strict: if you are not clearly seeing a spray wand / operator bay, return false.
Return ONLY JSON: {"bay":true|false,"what":"<=10 words","confidence":0.0-1.0}`;

const dl = async u => { for (let a = 0; a < 2; a++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(15000) }); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch {} await sleep(400); } return null; };
const b64 = async b => { try { return (await sharp(b).resize(768, 768, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()).toString('base64'); } catch { return null; } };

let geminiCalls = 0;
async function geminiBay(imgB64) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GKEY}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: BAY_PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: imgB64 } }] }], generationConfig: { thinkingConfig: { thinkingBudget: 0 }, temperature: 0, responseMimeType: 'application/json' } }) });
      if (r.status === 429 || r.status >= 500) { await sleep(Math.min(2 ** a * 3, 30) * 1000); continue; }  // rate limit / transient
      geminiCalls++;
      const j = await r.json();
      const t = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const s = t.indexOf('{'), e = t.lastIndexOf('}');
      if (s < 0) { await sleep(600); continue; }
      try { return JSON.parse(t.slice(s, e + 1)); } catch { await sleep(500); }
    } catch { await sleep(1000 * (a + 1)); }
  }
  return null;
}

// Candidate photos for a listing: existing hero + gallery + up to 8 Places photos. NO montage.
async function candidatePhotos(l) {
  const urls = [];
  if (l.hero_image) urls.push(l.hero_image);
  for (const u of (l.photos || [])) urls.push(u);
  if (l.google_place_id) {
    try {
      const r = await fetch(`${SB_URL}/functions/v1/google-place-photos?place_id=${l.google_place_id}&offset=0&limit=8&size=1200`, { headers: { Authorization: `Bearer ${ANON}` }, signal: AbortSignal.timeout(25000) });
      if (r.ok) { const j = await r.json(); for (const p of (j.photos || [])) if (p.url) urls.push(p.url); }
    } catch {}
  }
  return [...new Set(urls)].slice(0, 12);
}

const NAME_SIG = /self[\s-]?serv|coin[\s-]?op|\bwand\b/i;

// Second signal: name token, or >=2 self-serve review snippets from the harvest.
async function corroboration(l) {
  if (NAME_SIG.test(l.name || '')) return 'name';
  const { data } = await sb.from('review_snippets').select('id').eq('listing_id', l.id).eq('is_self_serve_evidence', true).limit(3);
  if ((data?.length || 0) >= 2) return 'reviews';
  return null;
}

async function verifyOne(l) {
  const corr = await corroboration(l);
  if (!corr) return { l, verdict: 'no_second_signal' };            // (B) fails → out, don't even spend vision
  const photos = await candidatePhotos(l);
  if (!photos.length) return { l, verdict: 'no_photos', corr };
  // Judge each photo on its own; keep the best CLEAR bay.
  let best = null;
  for (const u of photos) {
    const buf = await dl(u); if (!buf) continue;
    const s = await b64(buf); if (!s) continue;
    const v = await geminiBay(s); await sleep(150);
    if (v?.bay === true && (v.confidence ?? 0) >= 0.80) { if (!best || v.confidence > best.v.confidence) best = { url: u, buf, v }; }
  }
  if (!best) return { l, verdict: 'no_clear_bay', corr };           // (A) fails → out
  return { l, verdict: 'CONFIRMED', corr, bayUrl: best.url, bayBuf: best.buf, what: best.v.what, conf: best.v.confidence };
}

// ── population ──────────────────────────────────────────────────────────────
async function loadTargets() {
  if (process.argv.includes('--self-test')) {
    const names = [['Signal Wash on Main%', 'CO'], ['Sparkle Express%', 'SC']];
    const out = [];
    for (const [n, s] of names) { const { data } = await sb.from('listings').select('id,name,city,state,hero_image,photos,google_place_id').ilike('name', n).eq('state', s).limit(1); if (data?.[0]) out.push(data[0]); }
    return out;
  }
  // Listings the harvest found self-serve review evidence for, that aren't already live self-serve.
  let ev = [];
  for (let p = 0; ; p++) {
    const { data, error } = await sb.from('review_snippets').select('listing_id').eq('source', 'gmaps-selfserve').order('id').range(p * 1000, p * 1000 + 999);
    if (error) { console.error('⛔', error.message); process.exit(1); }
    if (!data?.length) break; ev.push(...data.map(r => r.listing_id)); if (data.length < 1000) break;
  }
  const counts = {}; for (const id of ev) counts[id] = (counts[id] || 0) + 1;
  const strong = Object.keys(counts).filter(id => counts[id] >= 2);
  const rows = [];
  for (let i = 0; i < strong.length; i += 100) {
    const { data } = await sb.from('listings').select('id,name,city,state,hero_image,photos,google_place_id,is_self_service,is_approved')
      .in('id', strong.slice(i, i + 100));
    for (const r of (data || [])) if (!(r.is_self_service && r.is_approved)) rows.push(r);  // skip already-live
  }
  return rows.slice(0, LIMIT);
}

const targets = await loadTargets();
console.log(`Gemini verifier — ${targets.length} candidates | ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
const out = { CONFIRMED: [], no_clear_bay: [], no_second_signal: [], no_photos: [] };
async function hostBay(buf, id) {
  try { const o = await sharp(buf).resize(1600, 900, { fit: 'cover', position: 'centre' }).jpeg({ quality: 86 }).toBuffer();
    const path = `heroes/${id}-gemibay-${Date.now()}.jpg`;
    const { error } = await sb.storage.from('listing-photos').upload(path, o, { contentType: 'image/jpeg', upsert: true });
    return error ? null : sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
  } catch { return null; }
}
for (const l of targets) {
  const r = await verifyOne(l);
  out[r.verdict] = out[r.verdict] || []; out[r.verdict].push({ id: l.id, name: l.name, city: l.city, state: l.state, corr: r.corr, what: r.what, conf: r.conf });
  const icon = { CONFIRMED: '✅', no_clear_bay: '·', no_second_signal: '·', no_photos: '·' }[r.verdict];
  console.log(`${icon} ${l.name} (${l.city}, ${l.state}) — ${r.verdict}${r.verdict === 'CONFIRMED' ? ` [${r.corr} + bay: "${r.what}" ${r.conf}]` : r.corr ? ` [${r.corr}, but no clear bay]` : ''}`);
  if (APPLY && r.verdict === 'CONFIRMED') {
    const url = await hostBay(r.bayBuf, l.id);
    if (url) await sb.from('listings').update({ is_self_service: true, hero_image: url, hero_image_source: 'gemini_verified', self_service_source: 'gemini_bay_confirmed', self_service_reviewed_at: null }).eq('id', l.id);
  }
}
writeFileSync(`scripts/_gemini_verify_${Date.now()}.json`, JSON.stringify(out, null, 2));
console.log(`\n==================== GEMINI VERIFY ${APPLY ? 'APPLIED' : 'DRY RUN'} ====================`);
console.log(`✅ CONFIRMED self-serve (bay + 2nd signal): ${out.CONFIRMED.length}`);
console.log(`·  had a signal but NO clear bay photo:      ${(out.no_clear_bay || []).length}`);
console.log(`·  no independent 2nd signal:                ${(out.no_second_signal || []).length}`);
console.log(`·  no photos to check:                       ${(out.no_photos || []).length}`);
console.log(`Gemini calls: ${geminiCalls}`);
