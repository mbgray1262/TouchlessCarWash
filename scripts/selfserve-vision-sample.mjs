/**
 * STEP 3 PREVIEW — vision check on the harvest_unconfirmed (ambiguous) self-serve
 * bucket, using cheap Haiku. Shows whether vision can reliably tell a real
 * self-serve wash from an automatic / gas-station / not-a-wash false positive,
 * BEFORE committing to running it across all ~3,351. Read-only (no DB writes).
 *
 * Run: node scripts/selfserve-vision-sample.mjs [N]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5';
const SAMPLE = parseInt(process.argv[2] || '12', 10);
const MAX_IMAGES = 5, FETCH_TIMEOUT_MS = 12000, MIN_BYTES = 1500;

const RUBRIC = `You classify a car wash from its photos for a directory. Decide the PRIMARY wash type(s) visible.
Definitions:
- self_serve: open bays where the CUSTOMER holds a hand wand/lance or foam brush and washes the car themselves; per-bay coin/credit kiosks; "self serve" signage ON a wash bay (NOT on gas pumps).
- in_bay_automatic: a machine/gantry moves over a stationary car inside an enclosed bay (may be touchless or soft-touch).
- tunnel: a conveyor pulls cars through a long tunnel with brushes/mitter cloth.
- not_a_wash: gas station / convenience store / detailer / no wash actually visible.
Rules: self_serve=true ONLY if self-serve wand bays are actually visible. "Self serve" text on a gas canopy does NOT count. If photos are too ambiguous to tell, set confidence low.
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
  if (!imgs.length) return { error: 'no valid images' };
  const content = [{ type: 'text', text: `${RUBRIC}\n\nLocation name: ${listing.name}` }];
  imgs.forEach((g, i) => { content.push({ type: 'text', text: `Image ${i}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: g.media, data: g.data } }); });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) return { error: `API ${res.status}: ${(await res.text()).slice(0, 160)}` };
  const j = await res.json();
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  return { imagesUsed: imgs.length, parsed: extJson(text), usage: j.usage };
}

// pull ambiguous listings that actually have photos, take a spread
const rows = [];
{ let from = 0; while (rows.length < SAMPLE * 6 && from < 6000) { const { data } = await sb.from('listings').select('id,name,city,state,photos,website_photos').eq('self_service_source', 'harvest_unconfirmed').not('photos', 'is', null).order('id').range(from, from + 999); if (!data || !data.length) break; rows.push(...data.filter(r => Array.isArray(r.photos) && r.photos.length)); from += 1000; } }
// spread across the list rather than first-N alphabetical
const step = Math.max(1, Math.floor(rows.length / SAMPLE));
const picks = []; for (let i = 0; i < rows.length && picks.length < SAMPLE; i += step) picks.push(rows[i]);
console.log(`Ambiguous listings with photos available: ${rows.length}; sampling ${picks.length}\n`);

let inTok = 0, outTok = 0, real = 0, fp = 0, lowconf = 0;
for (const l of picks) {
  const r = await analyze(l);
  if (r.error) { console.log(`• ${l.name} (${l.city}, ${l.state}) — ${r.error}`); continue; }
  const p = r.parsed || {};
  inTok += r.usage?.input_tokens || 0; outTok += r.usage?.output_tokens || 0;
  const verdict = p.self_serve ? '✅ SELF-SERVE' : '❌ not self-serve';
  const conf = typeof p.confidence === 'number' ? p.confidence.toFixed(2) : '?';
  if (p.confidence >= 0.6) { p.self_serve ? real++ : fp++; } else lowconf++;
  console.log(`• ${l.name} (${l.city}, ${l.state})`);
  console.log(`    ${verdict}  conf ${conf}  types:[${(p.wash_types_visible || []).join(', ')}]  — ${p.reason || ''}`);
}

// Haiku 4.5 pricing: $1 / MTok in, $5 / MTok out
const cost = (inTok / 1e6) * 1 + (outTok / 1e6) * 5;
console.log(`\n==================== SAMPLE SUMMARY ====================`);
console.log(`Confident self-serve: ${real} | Confident NOT self-serve (false positives caught): ${fp} | Low-confidence: ${lowconf}`);
console.log(`Tokens: ${inTok.toLocaleString()} in / ${outTok.toLocaleString()} out  →  $${cost.toFixed(4)} for ${picks.length} listings`);
console.log(`Projected for all 3,351 ambiguous: ~$${((cost / picks.length) * 3351).toFixed(2)}`);
