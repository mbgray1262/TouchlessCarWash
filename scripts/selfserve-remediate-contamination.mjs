/**
 * REMEDIATE the free-scraper photo contamination (see memory
 * project_scraper_photo_contamination). The old maps-photos-scrape.py regexed the
 * whole Maps page, so when Google served a search/nearby view (VPN drop) it cached
 * OTHER businesses' photos under a listing's place_id, and autophoto then set a
 * FOREIGN hero/gallery (e.g. Shiny Brite got a rival "Drive & Shine" building).
 *
 * Only OH + MI went through that scraper. For every OH/MI self-serve listing that
 * carries an autophoto-origin photo (ai-hero-/ai-g/real-*), this:
 *   1. Pulls the AUTHORITATIVE photos from the Google Places API (the same
 *      google-place-photos edge fn the review tool trusts — scoped to place_id, so
 *      it CANNOT contain another business's photos; VPN-independent).
 *   2. Asks Sonnet vision which of the currently-attached autophoto photos show a
 *      DIFFERENT business than the authoritative reference set (= contaminated).
 *   3. Removes the foreign photos; if the HERO was foreign, replaces it with the
 *      best authoritative photo at 1600px (via the edge fn POST) and flags the
 *      listing for a human re-check. Manually-curated (upload-/streetview) photos
 *      are never touched.
 *
 * Usage:
 *   node scripts/selfserve-remediate-contamination.mjs OH            # dry-run (detect + report)
 *   node scripts/selfserve-remediate-contamination.mjs OH --apply    # fix
 * Dry-run writes its vision verdicts to scripts/_remediation_verdicts_<STATE>.json;
 * --apply reuses them if present (no double vision cost). Fully backed up + reversible.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import sharp from 'sharp';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const sb = createClient(SB_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const AKEY = env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-5';
const STATE = (process.argv[2] || 'MI').toUpperCase();
const APPLY = process.argv.includes('--apply');
const VERDICT_FILE = `scripts/_remediation_verdicts_${STATE}.json`;

const isAuto = (u) => /\/(ai-hero-|ai-g\d|real-)/.test(u || '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IMGDIR = 'scripts/_remediation_imgcache';
mkdirSync(IMGDIR, { recursive: true });
// Disk-cache every downloaded image keyed by URL, so re-runs see IDENTICAL inputs (flaky
// re-downloads were flipping verdicts) and only pay for downloads once.
const dl = async (u) => {
  const key = `${IMGDIR}/${createHash('md5').update(u).digest('hex')}.bin`;
  if (existsSync(key)) { try { const b = readFileSync(key); if (b.length > 100) return b; } catch {} }
  for (let a = 0; a < 4; a++) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); if (b.length > 100) { writeFileSync(key, b); return b; } } }
    catch {}
    await new Promise((res) => setTimeout(res, 1000 * (a + 1)));
  }
  return null;
};
const small = async (buf) => { try { return (await sharp(buf).resize(400, 400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer()).toString('base64'); } catch { return null; } };

async function authPhotos(pid) {
  const cf = `${IMGDIR}/auth_${pid}.json`;
  if (existsSync(cf)) { try { return JSON.parse(readFileSync(cf, 'utf8')); } catch {} }
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`${SB_URL}/functions/v1/google-place-photos?place_id=${pid}&offset=0&limit=12`, { headers: { Authorization: `Bearer ${ANON}` } });
      if (r.ok) { const j = await r.json(); const out = (j.photos || []).map((p) => ({ name: p.name, url: p.url })); if (out.length || j.total === 0) { writeFileSync(cf, JSON.stringify(out)); return out; } }
    } catch {}
    await new Promise((res) => setTimeout(res, 1200 * (a + 1)));
  }
  return [];
}
// Host an authoritative Places photo at 1600px WITHOUT mutating the listing (we manage
// photos[] ourselves), returns the new supabase URL.
async function hostAuth(photoName, listingId) {
  try {
    const r = await fetch(`${SB_URL}/functions/v1/google-place-photos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}` },
      body: JSON.stringify({ photo_name: photoName, listing_id: listingId, update_listing: false }),
    });
    const j = await r.json();
    return j.url || null;
  } catch { return null; }
}

async function verify(listing, refs, cands) {
  // refs: [{b64}], cands: [{slot,url,b64}]
  const content = [{ type: 'text', text:
    `REF images = verified Google photos of "${listing.name}" (${listing.city}, ${listing.state}). CAND images = photos currently on the listing (exactly ${cands.length}, indexed 0..${cands.length - 1}); some may have been mis-scraped from a DIFFERENT nearby business. For each CAND: is it the SAME business/location as the REFs (same building/signage/bays) or a DIFFERENT business (foreign=true)? If REFs are too few/ambiguous to tell, set uncertain=true instead of guessing. Also give the REF index of the best landscape exterior to use as a hero.\nReturn ONLY JSON, no other text: {"candidates":[{"i":0,"foreign":false,"uncertain":false}],"best_hero_ref":-1}` }];
  refs.forEach((r, i) => { content.push({ type: 'text', text: `REF ${i}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: r.b64 } }); });
  cands.forEach((c, i) => { content.push({ type: 'text', text: `CAND ${i} (slot=${c.slot}):` }); content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: c.b64 } }); });
  // Retry with proper rate-limit handling — honor retry-after on 429/529/5xx (cached
  // images make calls fire fast enough to hit Anthropic's per-minute limit).
  for (let attempt = 0; attempt < 7; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 2500, messages: [{ role: 'user', content }] }),
      });
      if (res.status === 429 || res.status === 529 || res.status >= 500) {
        const ra = parseFloat(res.headers.get('retry-after') || '') || Math.min(2 ** attempt * 2, 40);
        await sleep(ra * 1000 + Math.random() * 800); continue;
      }
      if (!res.ok) { await sleep(2000); continue; }
      const j = await res.json();
      if (j?.stop_reason === 'max_tokens') { await sleep(1500); continue; }
      const txt = j?.content?.[0]?.text || '';
      const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
      if (a < 0 || b < 0) { await sleep(1500); continue; }
      try { return JSON.parse(txt.slice(a, b + 1)); } catch { await sleep(1200); }
    } catch { await sleep(2000 * (attempt + 1)); }
  }
  return null;
}

// ── Load affected listings ──────────────────────────────────────────────────
let rows = [], page = 0;
while (true) {
  const { data } = await sb.from('listings')
    .select('id,name,city,state,hero_image,hero_image_source,photos,google_place_id,self_service_source')
    .eq('state', STATE).eq('is_self_service', true).order('id').range(page * 1000, page * 1000 + 999);
  if (!data || !data.length) break; rows.push(...data); if (data.length < 1000) break; page++;
}
let affected = rows.filter((l) => l.google_place_id && (isAuto(l.hero_image) || (l.photos || []).some(isAuto))
  && l.self_service_source !== 'autophoto_needs_human'); // skip listings already remediated + flagged
// --only="Name A|Name B" — re-process just these listings (e.g. batch stragglers) without
// re-touching everything already resolved.
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
if (onlyArg) { const names = onlyArg.slice(7).split('|').map((s) => s.trim().toLowerCase()).filter(Boolean); affected = affected.filter((l) => names.some((n) => (l.name || '').toLowerCase().includes(n))); }
// --sample=N — check only N (evenly-spaced) listings, for a quick is-this-state-affected probe.
const sampleArg = process.argv.find((a) => a.startsWith('--sample='));
if (sampleArg) { const n = parseInt(sampleArg.slice(9), 10) || 10; if (affected.length > n) { const step = affected.length / n; affected = Array.from({ length: n }, (_, i) => affected[Math.floor(i * step)]); } }
console.log(`${STATE}: ${affected.length} self-serve listings carry an autophoto-origin photo — checking each against authoritative Google photos.\n`);

const cachedVerdicts = (!APPLY || !existsSync(VERDICT_FILE)) ? {} : JSON.parse(readFileSync(VERDICT_FILE, 'utf8'));
const verdicts = {};
const backups = [];
let clean = 0, contaminated = 0, fixed = 0, noAuth = 0, heroReplaced = 0, uncertainFlagged = 0;

for (const l of affected) {
  const cands = [];
  if (isAuto(l.hero_image)) cands.push({ slot: 'hero', url: l.hero_image });
  (l.photos || []).forEach((u) => { if (isAuto(u)) cands.push({ slot: 'gallery', url: u }); });
  if (!cands.length) continue;

  const auth = await authPhotos(l.google_place_id);
  if (auth.length === 0) {
    noAuth++;
    console.log(`  • ${l.name} (${l.city}) — ⚠ no authoritative photos returned — can't verify (left as-is)`);
    continue;
  }

  let v = cachedVerdicts[l.id];
  if (!v) {
    const refImgs = []; for (const a of auth.slice(0, 6)) { const b = await dl(a.url); const s = b && await small(b); if (s) refImgs.push({ b64: s }); }
    const candImgs = []; for (const c of cands.slice(0, 6)) { const b = await dl(c.url); const s = b && await small(b); if (s) candImgs.push({ ...c, b64: s }); }
    if (!refImgs.length || !candImgs.length) { noAuth++; console.log(`  • ${l.name} — image download failed — skipped`); continue; }
    v = await verify(l, refImgs, candImgs);
    await sleep(900); // pace calls to stay under the rate limit (verify() also honors retry-after)
    if (!v || !Array.isArray(v.candidates)) { console.log(`  • ${l.name} — vision parse failed — skipped`); continue; }
    // remember which cand index maps to which url/slot (candImgs order)
    v._cands = candImgs.map((c) => ({ slot: c.slot, url: c.url }));
    v._auth = auth.slice(0, 10);
  }
  verdicts[l.id] = v;

  const foreign = (v.candidates || []).filter((c) => c.foreign && !c.uncertain);
  const uncertain = (v.candidates || []).filter((c) => c.uncertain);
  if (!foreign.length) {
    clean++;
    if (uncertain.length) { uncertainFlagged++; console.log(`  • ${l.name} (${l.city}) — clean (but ${uncertain.length} uncertain)`); }
    continue;
  }
  contaminated++;
  const foreignUrls = new Set(foreign.map((c) => v._cands[c.i]?.url).filter(Boolean));
  const heroForeign = foreignUrls.has(l.hero_image) && isAuto(l.hero_image);
  console.log(`  • ${l.name} (${l.city}) — ❌ CONTAMINATED: ${foreignUrls.size} foreign photo(s)${heroForeign ? ' incl. HERO' : ''}`);

  if (!APPLY) continue;

  // Build the cleaned photos array (drop foreign) + fix hero if it was foreign.
  backups.push({ id: l.id, name: l.name, prev_hero_image: l.hero_image, prev_hero_image_source: l.hero_image_source, prev_photos: l.photos, prev_source: l.self_service_source });
  let newPhotos = (l.photos || []).filter((u) => !foreignUrls.has(u));
  const upd = { self_service_source: 'autophoto_needs_human' }; // flag for human re-check
  if (heroForeign) {
    const bi = Number.isInteger(v.best_hero_ref) ? v.best_hero_ref : 0;
    const pick = (v._auth || auth)[bi >= 0 ? bi : 0] || (v._auth || auth)[0];
    const hosted = pick ? await hostAuth(pick.name, l.id) : null;
    if (hosted) { upd.hero_image = hosted; upd.hero_image_source = 'google'; newPhotos = [hosted, ...newPhotos.filter((u) => u !== hosted)]; heroReplaced++; }
    else { console.log(`      ⚠ could not host a replacement hero — clearing foreign hero, needs manual`); upd.hero_image = null; }
  }
  upd.photos = newPhotos.slice(0, 8);
  const { error } = await sb.from('listings').update(upd).eq('id', l.id);
  if (error) console.log(`      ⚠ update error: ${error.message}`); else fixed++;
}

// Persist verdicts (dry-run) so --apply reuses them.
if (!APPLY) writeFileSync(VERDICT_FILE, JSON.stringify(verdicts, null, 2));
if (APPLY && backups.length) { const f = `scripts/_backup_remediation_${STATE}_${Date.now()}.json`; writeFileSync(f, JSON.stringify(backups, null, 2)); console.log(`\nBacked up ${backups.length} listings (reversible): ${f}`); }

console.log(`\n==================== REMEDIATION ${STATE} ${APPLY ? 'APPLIED' : 'DRY RUN'} ====================`);
console.log(`checked ${affected.length} | clean ${clean} | contaminated ${contaminated} | ${APPLY ? `fixed ${fixed} (hero replaced ${heroReplaced})` : 'run with --apply to fix'} | no-auth ${noAuth} | uncertain-flagged ${uncertainFlagged}`);
if (!APPLY && contaminated) console.log(`Verdicts saved to ${VERDICT_FILE}. Re-run with --apply to fix.`);
