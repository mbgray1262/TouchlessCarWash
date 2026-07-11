/**
 * Strict vision re-vet of the WEBSITE-sourced self-serve bucket (regex-matched
 * on the wash's own site text — medium reliability). Same conservative policy as
 * the vision re-vet, plus hand_wash / detailer added as confident disqualifiers.
 *
 * demote (confident tunnel/automatic/vacuum/hand_wash/detailer, no bays) ->
 *   is_self_service=false, source='revet_rejected'
 * keep -> source='website_revetted' (idempotent; re-runs skip it)
 * Only touches is_self_service / self_service_source. Backs up first. Resilient + concurrent.
 * Run: node scripts/selfserve-revet-website.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = env.ANTHROPIC_API_KEY, MODEL = 'claude-haiku-4-5';
const CONCURRENCY = 4, MAXI = 6, TO = 12000, MIN = 1500, DEMOTE_CONF = 0.7, COST_CAP = 12;

const RUBRIC = `You verify whether a car wash is genuinely SELF-SERVE, from its photos. Be STRICT.
self_serve = visible WASH BAYS: individual covered stalls where the CUSTOMER sprays the car with a handheld wand/lance, usually with a per-bay coin/credit box. That is the ONLY thing that qualifies.
NOT self-serve (traps):
- A row of self-serve VACUUM stations (vacuum hoses on posts, "VACUUM" signage). Vacuums are NOT wash bays.
- A tunnel/express wash (conveyor pulls cars through a long tunnel).
- An automatic in-bay (a machine moves over a stationary car).
- A HAND wash (attendants wash the car for the customer).
- A DETAILING shop (workers detail/polish cars; showroom or garage bays with no self-serve wands).
- Only a building exterior / entrance / signage with no wash bay shown.
If you only see the exterior, a tunnel, vacuums, hand-wash crews, or a detail shop — self_serve is FALSE.
If photos are too few/unclear to positively see self-serve wash bays, self_serve FALSE with low confidence. Do NOT guess.
Return ONLY JSON: {"self_serve": true|false, "sees": ["wash_bays"|"vacuums"|"tunnel"|"automatic"|"hand_wash"|"detailer"|"exterior_only"|"unclear"], "confidence": 0.0-1.0, "reason": "short"}.`;

async function grab(u) { try { const c = new AbortController(); const t = setTimeout(() => c.abort(), TO); const r = await fetch(u, { signal: c.signal }); clearTimeout(t); if (!r.ok) return null; const ct = (r.headers.get('content-type') || '').split(';')[0].toLowerCase(); const b = Buffer.from(await r.arrayBuffer()); if (b.length < MIN) return null; let m = ct.startsWith('image/') ? ct : null; if (!m) { const x = u.toLowerCase().match(/\.(jpe?g|png|webp|gif)(\?|$)/); if (x) m = 'image/' + (x[1] === 'jpg' ? 'jpeg' : x[1]); } if (!m || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(m)) return null; return { m, d: b.toString('base64') }; } catch { return null; } }
const xj = s => { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b < 0) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };

async function analyze(l) {
  const urls = [...new Set([...(Array.isArray(l.photos) ? l.photos : []), ...(Array.isArray(l.website_photos) ? l.website_photos : [])].filter(u => typeof u === 'string' && u.startsWith('http')))];
  const imgs = []; for (const u of urls) { if (imgs.length >= MAXI) break; const g = await grab(u); if (g) imgs.push(g); }
  if (!imgs.length) return { noimg: true };
  const content = [{ type: 'text', text: `${RUBRIC}\n\nName: ${l.name}` }];
  imgs.forEach((g, i) => { content.push({ type: 'text', text: `Image ${i}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: g.m, data: g.d } }); });
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content }] }), signal: AbortSignal.timeout(30000) });
    if (!res.ok) return { apiErr: res.status };
    const j = await res.json(); return { n: imgs.length, p: xj((j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')), usage: j.usage };
  } catch (e) { return { apiErr: e?.message || 'fetch failed' }; }
}

function isConfidentDisqualifier(p) {
  if (!p || p.self_serve !== false || (p.confidence ?? 0) < DEMOTE_CONF) return false;
  const sees = (p.sees || []).map(s => String(s).toLowerCase());
  if (sees.includes('wash_bays')) return false;
  return ['tunnel', 'automatic', 'vacuums', 'hand_wash', 'detailer'].some(d => sees.includes(d));
}

const pool = [];
{ let from = 0; while (true) { const { data } = await sb.from('listings').select('id,name,city,state,photos,website_photos').eq('self_service_source', 'website').not('photos', 'eq', '{}').not('photos', 'is', null).order('id').range(from, from + 999); if (!data || !data.length) break; pool.push(...data.filter(r => Array.isArray(r.photos) && r.photos.length)); from += data.length; if (data.length < 1000) break; } }
writeFileSync(`scripts/_backup_revet_website_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(pool.map(r => ({ id: r.id, name: r.name, is_self_service: true, self_service_source: 'website' })), null, 2));
console.log(`Re-vetting ${pool.length.toLocaleString()} website-sourced listings\n`);

let idx = 0, done = 0, demoted = 0, kept = 0, noimg = 0, errors = 0, inTok = 0, outTok = 0, stop = false;
async function worker() {
  while (!stop) {
    const i = idx++; if (i >= pool.length) break;
    const l = pool[i]; const r = await analyze(l); done++;
    if (r.noimg) { noimg++; continue; }
    if (r.apiErr) { errors++; continue; }
    inTok += r.usage?.input_tokens || 0; outTok += r.usage?.output_tokens || 0;
    if (isConfidentDisqualifier(r.p)) { demoted++; await sb.from('listings').update({ is_self_service: false, self_service_source: 'revet_rejected' }).eq('id', l.id); }
    else { kept++; await sb.from('listings').update({ self_service_source: 'website_revetted' }).eq('id', l.id); }
    const cost = (inTok / 1e6) * 1 + (outTok / 1e6) * 5;
    if (done % 40 === 0) console.log(`  ${done}/${pool.length}  demoted:${demoted} kept:${kept} noimg:${noimg}  $${cost.toFixed(2)}`);
    if (cost >= COST_CAP) { stop = true; console.log('\n⛔ COST CAP'); }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const cost = (inTok / 1e6) * 1 + (outTok / 1e6) * 5;
console.log(`\n==================== WEBSITE RE-VET DONE ====================`);
console.log(`Processed: ${done.toLocaleString()}`);
console.log(`❌ Demoted (source=revet_rejected): ${demoted.toLocaleString()}`);
console.log(`🟢 Kept (source=website_revetted): ${kept.toLocaleString()}`);
console.log(`📷 No images: ${noimg.toLocaleString()}   ⚠ API errors (retry): ${errors.toLocaleString()}`);
console.log(`💰 Cost: $${cost.toFixed(2)}`);
