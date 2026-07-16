/**
 * How many LIVE self-serve listings actually show the user a wand bay?
 *
 * Michael: "every car wash that we say is self serv should have at least one photo of a self
 * service bay. Otherwise there is no evidence to the user that it is actually self serv."
 *
 * We never tracked this, so the honest answer today is "unknown". This SAMPLES the live set
 * to size the gap before anyone spends money fixing it. It reads ONLY photos we already
 * store (no Places fetch, no Street View) so it costs ~$0.03/listing instead of ~$0.15, and
 * it writes listings.self_serve_bay_photo for every listing it checks — so the sample is
 * also real progress, not just a measurement.
 *
 *   node scripts/audit-selfserve-bay-evidence.mjs --limit 150 --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import sharp from 'sharp';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const AKEY = env.ANTHROPIC_API_KEY;
const APPLY = process.argv.includes('--apply');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LIMIT = parseInt(arg('--limit', '150'), 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LEDGER = 'scripts/_autopilot_spend.json', CAP = 200;
let spend = existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, 'utf8')).usd || 0) : 0;
const TOK = { in: 2 / 1e6, out: 10 / 1e6 };
const saveSpend = () => writeFileSync(LEDGER, JSON.stringify({ usd: Number(spend.toFixed(4)), updated: new Date().toISOString() }, null, 2));

const dl = async u => { for (let a = 0; a < 2; a++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(15000) }); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch {} await sleep(400); } return null; };
const b64 = async b => { try { return (await sharp(b).resize(480, 480, { fit: 'inside' }).jpeg({ quality: 68 }).toBuffer()).toString('base64'); } catch { return null; } };

async function ask(content) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 700, messages: [{ role: 'user', content }] }) });
      if (r.status === 429 || r.status >= 500) { await sleep(2 ** a * 3000); continue; }
      if (!r.ok) { await sleep(1000); continue; }
      const j = await r.json();
      const u = j?.usage; if (u) spend += (u.input_tokens || 0) * TOK.in + (u.output_tokens || 0) * TOK.out;
      const t = (j?.content || []).filter(c => c?.type === 'text').map(c => c.text || '').join('');
      const s = t.indexOf('{'), e = t.lastIndexOf('}');
      if (s < 0) { await sleep(600); continue; }
      try { return JSON.parse(t.slice(s, e + 1)); } catch { await sleep(600); }
    } catch { await sleep(1000); }
  }
  return null;
}

let rows = [];
for (let p = 0; ; p++) {
  let data, error;
  for (let a = 0; a < 5; a++) {
    ({ data, error } = await sb.from('listings').select('id,name,city,state,hero_image,photos')
      .eq('is_self_service', true).eq('is_approved', true).not('self_service_reviewed_at', 'is', null)
      .is('self_serve_bay_photo', null).order('id').range(p * 300, p * 300 + 299));
    if (!error) break;
    await sleep(3000 * (a + 1));
  }
  if (error) { console.error('⛔ query failed:', error.message); process.exit(1); }
  if (!data?.length) break;
  rows.push(...data);
  if (data.length < 300 || rows.length >= LIMIT) break;
}
rows = rows.slice(0, LIMIT);
console.log(`auditing ${rows.length} LIVE self-serve listings for bay evidence | spend $${spend.toFixed(2)}/$${CAP}\n`);

let has = 0, none = 0, unknown = 0;
const noProof = [];
for (const l of rows) {
  if (spend >= CAP) { console.log('\n⛔ budget cap reached — stopping cleanly.'); break; }
  const urls = [l.hero_image, ...(l.photos || [])].filter(Boolean).slice(0, 6);
  if (!urls.length) { unknown++; continue; }
  const imgs = [];
  for (const u of urls) { const b = await dl(u); if (b) { const s = await b64(b); if (s) imgs.push(s); } }
  if (!imgs.length) { unknown++; continue; }

  const content = [{ type: 'text', text:
`These are ALL the photos we publish for "${l.name}" (${l.city}, ${l.state}) — a listing our directory labels SELF-SERVE.

A visitor should be able to see the proof. Is self-service wand-bay EQUIPMENT visible in ANY of these frames?
Counts as proof: a spray wand on its holster/boom, a foam brush, a coin/card/timer box, an open bay clearly built for the driver to operate.
Does NOT count: an automatic gantry/arch, a tunnel, vacuums, a closed shutter, or a sign that merely reads "SELF SERVE" with no equipment visible.

Return ONLY JSON: {"bay_visible": true|false, "where":"<which photo + what you see, 10 words>", "confidence":0.0-1.0}` }];
  for (const s of imgs) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: s } });

  const v = await ask(content); await sleep(200);
  if (!v || typeof v.bay_visible !== 'boolean') { unknown++; continue; }
  const proof = v.bay_visible && (v.confidence ?? 0) >= 0.6;
  if (proof) has++; else { none++; noProof.push({ id: l.id, name: l.name, city: l.city, state: l.state, why: v.where }); }
  console.log(`${proof ? '✅' : '❌'} ${l.name} (${l.city}) — ${v.where}`);
  if (APPLY) await sb.from('listings').update({ self_serve_bay_photo: proof }).eq('id', l.id);
  saveSpend();
}
saveSpend();
const n = has + none;
writeFileSync(`scripts/_bay_audit_${Date.now()}.json`, JSON.stringify({ checked: n, has, none, noProof }, null, 2));
console.log(`\n==================== BAY-EVIDENCE AUDIT ====================`);
console.log(`checked ................. ${n}`);
console.log(`✅ shows a wand bay ..... ${has}  (${n ? Math.round(has / n * 100) : 0}%)`);
console.log(`❌ NO visual proof ...... ${none}  (${n ? Math.round(none / n * 100) : 0}%)  ← claims self-serve, shows the user nothing`);
console.log(`   couldn't read ........ ${unknown}`);
if (n) console.log(`\nextrapolated to all 1,246 live self-serve listings: ~${Math.round(none / n * 1246)} with no proof`);
console.log(`SPEND: $${spend.toFixed(2)} / $${CAP}`);
