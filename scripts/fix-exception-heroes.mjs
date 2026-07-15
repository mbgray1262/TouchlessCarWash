/**
 * Fix the heroes the exception resolver flagged: wrong-business heroes and genuinely poor ones.
 *
 * The fix is to swap the hero to official Street View — aimed at the building, dated, and
 * incapable of showing a neighbour's premises when the coordinates are right. That last clause
 * is the catch: for one flagged listing Street View showed an APARTMENT BUILDING, meaning the
 * coordinates are wrong, not the photo. Swapping the hero there would replace a correct photo
 * with a wrong one. So Street View is verified as showing THIS wash before it's promoted.
 *
 * Anything that doesn't verify is left exactly as-is and reported — a bad hero is better than
 * a confidently wrong one, and these are live pages.
 *
 *   node scripts/fix-exception-heroes.mjs           # dry run
 *   node scripts/fix-exception-heroes.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import sharp from 'sharp';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const GKEY = env.GOOGLE_PLACES_API_KEY, AKEY = env.ANTHROPIC_API_KEY;
const APPLY = process.argv.includes('--apply');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEDGER = 'scripts/_autopilot_spend.json', CAP = 200;
let spend = existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, 'utf8')).usd || 0) : 0;
const TOK = { in: 2 / 1e6, out: 10 / 1e6 };
const saveSpend = () => writeFileSync(LEDGER, JSON.stringify({ usd: Number(spend.toFixed(4)), updated: new Date().toISOString() }, null, 2));

const dl = async u => { for (let a = 0; a < 3; a++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch {} await sleep(500 * (a + 1)); } return null; };
const b64 = async b => { try { return (await sharp(b).resize(700, 700, { fit: 'inside' }).jpeg({ quality: 76 }).toBuffer()).toString('base64'); } catch { return null; } };
const bearing = (f, t) => { const R = d => d * Math.PI / 180, D = r => r * 180 / Math.PI;
  const y = Math.sin(R(t.lng - f.lng)) * Math.cos(R(t.lat));
  const x = Math.cos(R(f.lat)) * Math.sin(R(t.lat)) - Math.sin(R(f.lat)) * Math.cos(R(t.lat)) * Math.cos(R(t.lng - f.lng));
  return (D(Math.atan2(y, x)) + 360) % 360; };

async function streetView(lat, lng) {
  if (lat == null || lng == null) return null;
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&source=outdoor&radius=120&key=${GKEY}`, { signal: AbortSignal.timeout(15000) });
    const j = await r.json(); if (j.status !== 'OK') return null;
    const d = Math.round(Math.hypot((j.location.lat - lat) * 111320, (j.location.lng - lng) * 111320 * Math.cos(lat * Math.PI / 180)));
    // Frame the building: narrower FOV the further the pano sits from the address.
    const fov = Math.max(35, Math.min(95, 2 * Math.atan((40 / 2) / Math.max(d, 10)) * 180 / Math.PI));
    const h = bearing(j.location, { lat, lng });
    const img = await dl(`https://maps.googleapis.com/maps/api/streetview?size=1600x900&pano=${j.pano_id}&heading=${h.toFixed(0)}&fov=${fov.toFixed(0)}&pitch=2&key=${GKEY}`);
    spend += 0.007;
    return img ? { buf: img, date: j.date, dist: d } : null;
  } catch { return null; }
}

async function ask(content) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 1200, messages: [{ role: 'user', content }] }) });
      if (r.status === 429 || r.status >= 500) { await sleep(Math.min(2 ** a * 2, 20) * 1000); continue; }
      if (!r.ok) { await sleep(1200); continue; }
      const j = await r.json();
      const u = j?.usage; if (u) spend += (u.input_tokens || 0) * TOK.in + (u.output_tokens || 0) * TOK.out;
      if (j?.stop_reason === 'max_tokens') return null;
      const t = (j?.content || []).filter(c => c?.type === 'text').map(c => c.text || '').join('');
      const s = t.indexOf('{'), e = t.lastIndexOf('}');
      if (s < 0 || e < 0) { await sleep(800); continue; }
      try { return JSON.parse(t.slice(s, e + 1)); } catch { await sleep(700); }
    } catch { await sleep(1200 * (a + 1)); }
  }
  return null;
}

async function hostBuffer(buf, id, tag) {
  try {
    const out = await sharp(buf).resize(1600, 900, { fit: 'cover', position: 'centre' }).jpeg({ quality: 86 }).toBuffer();
    const path = `heroes/${id}-${tag}-${Date.now()}.jpg`;
    const { error } = await sb.storage.from('listing-photos').upload(path, out, { contentType: 'image/jpeg', upsert: true });
    if (error) { console.log('   upload failed:', error.message); return null; }
    return sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
  } catch (e) { console.log('   host failed:', String(e).slice(0, 60)); return null; }
}

const f = readdirSync('scripts').filter(x => x.startsWith('_exceptions_resolved_')).sort().pop();
const res = JSON.parse(readFileSync('scripts/' + f, 'utf8'));
const targets = [...res.wrong_business.map(r => ({ ...r, kind: 'wrong_business' })), ...res.poor_hero.map(r => ({ ...r, kind: 'poor_hero' }))];
console.log(`${targets.length} heroes to fix | spend $${spend.toFixed(2)}/$${CAP} | ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

const done = [], skipped = [];
for (const t of targets) {
  const { data: l } = await sb.from('listings').select('id,name,city,state,address,latitude,longitude,hero_image').eq('id', t.id).single();
  if (!l) { skipped.push({ ...t, why: 'listing not found' }); continue; }
  const sv = await streetView(l.latitude, l.longitude);
  if (!sv) { skipped.push({ ...t, why: 'no Street View at these coords' }); console.log(`⏭  ${l.name} — no Street View; hero left as-is`); continue; }
  const svb = await b64(sv.buf);
  if (!svb) { skipped.push({ ...t, why: 'SV unreadable' }); continue; }

  const v = await ask([{ type: 'text', text:
`Official Google Street View of ${l.address}, ${l.city}, ${l.state}, captured ${sv.date}. Camera is aimed at the address from ${sv.dist}m away.

We want to publish this as the hero image for our directory listing "${l.name}". The listing's current photo was rejected (${t.kind === 'wrong_business' ? `it appears to show a different business — its sign read "${t.sign}"` : `poor quality — ${t.why}`}).

Answer two things:
1. Does this Street View show a CAR WASH, and is it plausibly "${l.name}"? (Signage matching the name is ideal; an unbranded but clearly-a-car-wash building at the right address is acceptable. If it shows an apartment building, a repair shop, trees, or an unrelated business, the answer is NO — that means our coordinates are wrong, and this image must NOT be published.)
2. Is it good enough to be a hero — the facility legible, reasonably framed, not obstructed?

Return ONLY JSON:
{"is_this_wash": true|false, "what_i_see":"<10 words>", "good_hero": true|false, "confidence":0.0-1.0}` },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: svb } }]);
  await sleep(300);

  if (!v) { skipped.push({ ...t, why: 'vision inconclusive' }); console.log(`⏭  ${l.name} — vision inconclusive`); continue; }
  if (!v.is_this_wash || (v.confidence ?? 0) < 0.6) {
    skipped.push({ ...t, why: `SV shows: ${v.what_i_see} (conf ${v.confidence})` });
    console.log(`🚩 ${l.name} — SV shows "${v.what_i_see}" → NOT publishing. Likely wrong coordinates.`);
    continue;
  }
  if (!v.good_hero) { skipped.push({ ...t, why: `SV not hero-grade: ${v.what_i_see}` }); console.log(`⏭  ${l.name} — SV not hero-grade (${v.what_i_see})`); continue; }

  console.log(`✅ ${l.name} (${l.city}) — SV ${sv.date}: ${v.what_i_see} → new hero`);
  if (APPLY) {
    const url = await hostBuffer(sv.buf, l.id, 'sv');
    if (url) {
      const { error } = await sb.from('listings').update({ hero_image: url, hero_image_source: 'street_view_fix', self_service_source: 'autopilot_ok' }).eq('id', l.id);
      if (error) { console.log('   ⚠ write failed:', error.message); continue; }
      done.push({ id: l.id, name: l.name, prev_hero: l.hero_image, new_hero: url, sv_date: sv.date });
    }
  } else done.push({ id: l.id, name: l.name });
  saveSpend();
}
saveSpend();
if (APPLY && done.length) writeFileSync(`scripts/_backup_hero_fix_${Date.now()}.json`, JSON.stringify(done, null, 2));
console.log(`\n==================== HERO FIX ${APPLY ? 'APPLIED' : 'DRY RUN'} ====================`);
console.log(`✅ hero replaced with Street View .. ${done.length}`);
console.log(`🚩 left alone (needs a human) ...... ${skipped.length}`);
for (const s of skipped) console.log(`     • ${s.name} — ${s.why}`);
console.log(`SPEND: $${spend.toFixed(2)} / $${CAP}`);
