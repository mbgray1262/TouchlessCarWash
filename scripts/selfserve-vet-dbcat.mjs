/**
 * Free-first growth: promote self-serve washes ALREADY in our DB that have a
 * self-serve Google category but were never tagged (didn't surface in the
 * page-1 harvest). Filters tunnel-chains/junk/detailer names, then strict vision:
 * PROMOTE only when it positively sees self-serve WASH BAYS (2-signal: Google
 * category + visible bays). Others marked 'dbcat_rejected' so they don't recur.
 * Only touches is_self_service / self_service_source. Backup first. Run: node scripts/selfserve-vet-dbcat.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = env.ANTHROPIC_API_KEY, MODEL = 'claude-haiku-4-5';
const CONCURRENCY = 4, MAXI = 6, TO = 12000, MIN = 1500, PROMOTE_CONF = 0.6;

const TUNNEL = /\b(mister car ?wash|take[\s-]?5|zips|quick ?quack|white ?water|super ?star|whistle express|tidal wave|tommy'?s|tsunami|luv car ?wash|go car ?wash|club car ?wash|el car ?wash|autobell|rocket car ?wash|caliber car ?wash|spinx|express ?wash|xpress)\b/i;
const JUNKNAME = /storage|hy-?vee|\bgas\b|grocery|market|dollar|walgreens|walmart|costco|sam'?s club|kroger|fuel|petrol/i;
const DETAILHAND = /\bdetail(ing|er)?\b|\bhand[\s-]?(car[\s-]?)?wash\b/i;
const DECIDED = new Set(['revet_rejected', 'namecat_rejected', 'vision_rejected', 'vision_noimg', 'vision', 'vision_revetted', 'website_revetted', 'dbcat_rejected']);

const RUBRIC = `You verify whether a car wash is genuinely SELF-SERVE, from its photos. Be STRICT.
self_serve = visible WASH BAYS: individual covered stalls where the CUSTOMER sprays the car with a handheld wand/lance, usually with a per-bay coin/credit box. That is the ONLY thing that qualifies.
NOT self-serve: self-serve VACUUM stations only; tunnel/express (conveyor); automatic in-bay (machine over a stationary car); hand wash (attendants); detailing shop; only a building exterior with no bay shown.
If you don't positively see self-serve wash bays, self_serve is FALSE. Do NOT guess from an exterior.
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
    const j = await res.json(); return { p: xj((j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')), usage: j.usage };
  } catch (e) { return { apiErr: e?.message || 'fetch failed' }; }
}
const isSelfServe = p => p && p.self_serve === true && (p.confidence ?? 0) >= PROMOTE_CONF && (p.sees || []).map(s => String(s).toLowerCase()).includes('wash_bays');

// candidates: self-serve google category, not yet tagged, never decided, clean name, has photos
const all = []; let from = 0;
while (true) { const { data } = await sb.from('listings').select('id,name,is_self_service,self_service_source,photos,website_photos').or('google_category.ilike.%self%serv%,google_subtypes.ilike.%self%serv%').order('id').range(from, from + 999); if (!data || !data.length) break; all.push(...data); from += data.length; if (data.length < 1000) break; }
const pool = all.filter(r => r.is_self_service !== true && !DECIDED.has(r.self_service_source) && !TUNNEL.test(r.name || '') && !JUNKNAME.test(r.name || '') && !DETAILHAND.test(r.name || '') && Array.isArray(r.photos) && r.photos.length);
writeFileSync(`scripts/_backup_vet_dbcat_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(pool.map(r => ({ id: r.id, name: r.name, prev_source: r.self_service_source })), null, 2));
console.log(`Vetting ${pool.length} DB self-serve-category candidates (promote only if wash bays seen)\n`);

let idx = 0, done = 0, promoted = 0, rejected = 0, noimg = 0, errors = 0, inTok = 0, outTok = 0;
async function worker() {
  while (true) {
    const i = idx++; if (i >= pool.length) break;
    const l = pool[i]; const r = await analyze(l); done++;
    if (r.noimg) { noimg++; continue; }
    if (r.apiErr) { errors++; continue; }
    inTok += r.usage?.input_tokens || 0; outTok += r.usage?.output_tokens || 0;
    if (isSelfServe(r.p)) { promoted++; await sb.from('listings').update({ is_self_service: true, self_service_source: 'dbcat_vision' }).eq('id', l.id); }
    else { rejected++; await sb.from('listings').update({ self_service_source: 'dbcat_rejected' }).eq('id', l.id); }
    if (done % 30 === 0) console.log(`  ${done}/${pool.length}  promoted:${promoted} rejected:${rejected}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const cost = (inTok / 1e6) * 1 + (outTok / 1e6) * 5;
console.log(`\n==================== DB-CAT VET DONE ====================`);
console.log(`Processed: ${done}  |  🟢 Promoted: ${promoted}  |  ❌ Rejected: ${rejected}  |  noimg: ${noimg}  err: ${errors}`);
console.log(`💰 Cost: $${cost.toFixed(2)}`);
