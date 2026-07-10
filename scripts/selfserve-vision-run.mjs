/**
 * STEP 3 — full vision pass over the harvest_unconfirmed (ambiguous) self-serve
 * bucket using Haiku. Promotes real self-serve washes back to is_self_service=true
 * (self_service_source='vision'); marks false positives 'vision_rejected' so they
 * leave the pool and never re-process. Resumable, concurrent, cost-capped.
 * Only touches is_self_service / self_service_source — never is_touchless / is_approved / hero.
 *
 * Run: node scripts/selfserve-vision-run.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5';
const CONCURRENCY = 4, MAX_IMAGES = 5, FETCH_TIMEOUT_MS = 12000, MIN_BYTES = 1500;
const PROMOTE_CONF = 0.55, COST_CAP = 25;

const RUBRIC = `You classify a car wash from its photos for a directory. Decide the PRIMARY wash type(s) visible.
- self_serve: open bays where the CUSTOMER holds a hand wand/lance or foam brush; per-bay coin/credit kiosks; "self serve" signage ON a wash bay (NOT on gas pumps).
- in_bay_automatic: a machine/gantry moves over a stationary car inside an enclosed bay.
- tunnel: a conveyor pulls cars through a long tunnel with brushes/mitter cloth.
- not_a_wash: gas station / store / detailer / no wash actually visible.
Rules: self_serve=true ONLY if self-serve wand bays are actually visible; "self serve" on a gas canopy does NOT count. If too ambiguous, low confidence.
Return ONLY JSON: {"self_serve": true|false, "wash_types_visible": ["..."], "confidence": 0.0-1.0, "reason": "short"}.`;

async function grabImage(url) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < MIN_BYTES) return null;
    let media = ct.startsWith('image/') ? ct : null;
    if (!media) { const m = url.toLowerCase().match(/\.(jpe?g|png|webp|gif)(\?|$)/); if (m) media = 'image/' + (m[1] === 'jpg' ? 'jpeg' : m[1]); }
    if (!media || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(media)) return null;
    return { media, data: buf.toString('base64') };
  } catch { return null; }
}
const extJson = (s) => { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b < 0) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };

async function analyze(listing) {
  const urls = [...new Set([...(Array.isArray(listing.photos) ? listing.photos : []),
    ...(Array.isArray(listing.website_photos) ? listing.website_photos : [])].filter(u => typeof u === 'string' && u.startsWith('http')))];
  const imgs = [];
  for (const u of urls) { if (imgs.length >= MAX_IMAGES) break; const g = await grabImage(u); if (g) imgs.push(g); }
  if (!imgs.length) return { noimg: true };
  const content = [{ type: 'text', text: `${RUBRIC}\n\nLocation name: ${listing.name}` }];
  imgs.forEach((g, i) => { content.push({ type: 'text', text: `Image ${i}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: g.media, data: g.data } }); });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) return { apiErr: `${res.status}` };
  const j = await res.json();
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  return { parsed: extJson(text), usage: j.usage };
}

// load the whole pool up front (ids only), then process with a worker pool
const pool = [];
{ let from = 0; while (true) { const { data } = await sb.from('listings').select('id,name,photos,website_photos').eq('self_service_source', 'harvest_unconfirmed').not('photos', 'is', null).order('id').range(from, from + 999); if (!data || !data.length) break; pool.push(...data); from += data.length; if (data.length < 1000) break; } }
console.log(`Vision pass over ${pool.length.toLocaleString()} ambiguous listings (concurrency ${CONCURRENCY}, cost cap $${COST_CAP})\n`);

let idx = 0, done = 0, promoted = 0, rejected = 0, noimg = 0, errors = 0, inTok = 0, outTok = 0, stop = false;
async function worker() {
  while (!stop) {
    const i = idx++; if (i >= pool.length) break;
    const l = pool[i];
    const r = await analyze(l);
    done++;
    if (r.noimg) { noimg++; await sb.from('listings').update({ self_service_source: 'vision_noimg' }).eq('id', l.id); }
    else if (r.apiErr) { errors++; /* leave as harvest_unconfirmed to retry next run */ }
    else {
      inTok += r.usage?.input_tokens || 0; outTok += r.usage?.output_tokens || 0;
      const p = r.parsed || {};
      if (p.self_serve === true && (p.confidence ?? 0) >= PROMOTE_CONF) {
        promoted++;
        await sb.from('listings').update({ is_self_service: true, self_service_source: 'vision' }).eq('id', l.id);
      } else {
        rejected++;
        await sb.from('listings').update({ self_service_source: 'vision_rejected' }).eq('id', l.id);
      }
    }
    const cost = (inTok / 1e6) * 1 + (outTok / 1e6) * 5;
    if (done % 50 === 0) console.log(`  ${done}/${pool.length}  promoted:${promoted} rejected:${rejected} noimg:${noimg} err:${errors}  $${cost.toFixed(2)}`);
    if (cost >= COST_CAP) { stop = true; console.log(`\n⛔ COST CAP $${COST_CAP} hit — stopping.`); }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const cost = (inTok / 1e6) * 1 + (outTok / 1e6) * 5;
console.log(`\n==================== VISION PASS DONE ====================`);
console.log(`Processed: ${done.toLocaleString()}`);
console.log(`🟢 Promoted to self-serve (source=vision): ${promoted.toLocaleString()}`);
console.log(`❌ Rejected (source=vision_rejected): ${rejected.toLocaleString()}`);
console.log(`📷 No usable images (source=vision_noimg): ${noimg.toLocaleString()}`);
console.log(`⚠ API errors (left for retry): ${errors.toLocaleString()}`);
console.log(`💰 Cost: $${cost.toFixed(2)}  (${inTok.toLocaleString()} in / ${outTok.toLocaleString()} out)`);
