/**
 * qa-touchless-authenticity — verify every Best-Of trophy winner is GENUINELY touchless
 * before any "Best Touchless" award goes out. Reads each listing's stored classification
 * evidence + customer review language and judges it against a strict touchless definition
 * via Haiku (claude-haiku-4-5). Flags brush/tunnel/soft-touch/self-serve-only/detailing
 * false positives that must NOT receive a touchless trophy.
 *
 * Run:  node scripts/qa-touchless-authenticity.mjs [limit]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const LIMIT = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

// 1. winners
const { data: tr } = await db.from('best_of_rankings').select('listing_id, metro_name, rank').order('metro_name').order('rank');
const meta = new Map();
for (const t of tr) { const a = meta.get(t.listing_id) ?? []; a.push(`${t.metro_name} #${t.rank}`); meta.set(t.listing_id, a); }
let ids = [...meta.keys()]; if (LIMIT < ids.length) ids = ids.slice(0, LIMIT);

// 2. listings
const L = [];
for (const c of chunk(ids, 200)) {
  const { data } = await db.from('listings')
    .select('id,name,city,state,parent_chain,touchless_verified,touchless_wash_types,touchless_evidence,touchless_satisfaction_score,description,google_description')
    .in('id', c);
  L.push(...data);
}
// 3. snippets (text + flags) — keep the touchless-evidence ones + a few others
const snips = new Map();
for (const c of chunk(ids, 200)) {
  for (let off = 0; ; off += 1000) {
    const { data } = await db.from('review_snippets')
      .select('listing_id,is_touchless_evidence,touchless_keywords,review_text,rating').in('listing_id', c).range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data) { const a = snips.get(r.listing_id) ?? []; a.push(r); snips.set(r.listing_id, a); }
    if (data.length < 1000) break;
  }
}

const SYSTEM = `You are auditing car-wash listings for a TOUCHLESS car-wash directory. A location qualifies as TOUCHLESS only if it offers an AUTOMATIC, NO-BRUSH wash — i.e. touch-free / touchless / laser wash / high-pressure water+chemical with NO physical brushes or cloth contacting the car. "Brushless" automatic counts as touchless.
DOES NOT qualify as touchless: brush/friction tunnels, soft-touch/soft-cloth washes, spinning-bristle automatics, hand washes, full-service detailing-only shops. A SELF-SERVE wand bay ALONE does not count (must have an AUTOMATIC touchless bay).
A MIXED facility DOES qualify if it has at least one genuine touchless/touch-free/laser AUTOMATIC bay alongside other services.
Judge ONLY from the evidence given. Reviews that mention brushes/bristles/cloth touching the car are evidence AGAINST touchless unless a touchless bay is also clearly present.
Reply ONLY with compact JSON: {"verdict":"confirmed_touchless"|"not_touchless"|"uncertain","facility_type":"touchless_automatic"|"mixed_with_touchless"|"brush_tunnel"|"soft_touch"|"self_serve_only"|"detailing_only"|"unknown","confidence":0-1,"reason":"<=20 words"}`;

async function classify(l) {
  const sn = (snips.get(l.id) ?? []);
  const eviSn = sn.filter((s) => s.is_touchless_evidence).slice(0, 4);
  const otherSn = sn.filter((s) => !s.is_touchless_evidence).slice(0, 4);
  const snLines = [...eviSn, ...otherSn].slice(0, 6)
    .map((s) => `- (${s.rating}★${s.is_touchless_evidence ? ', touchless-kw:' + (s.touchless_keywords || []).join('/') : ''}) ${(s.review_text || '').slice(0, 240)}`).join('\n');
  const user = `Listing: ${l.name} — ${l.city}, ${l.state}${l.parent_chain ? ' [chain: ' + l.parent_chain + ']' : ''}
touchless_wash_types: ${JSON.stringify(l.touchless_wash_types || [])}
Classification evidence on file: ${l.touchless_evidence || '(none)'}
Description: ${(l.description || l.google_description || '(none)').slice(0, 400)}
Customer reviews (sampled):
${snLines || '(no review snippets harvested)'}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 200, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const j = await res.json();
  const txt = j.content?.[0]?.text ?? '';
  const m = txt.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { verdict: 'uncertain', facility_type: 'unknown', confidence: 0, reason: 'parse-fail' };
}

// concurrency pool
const out = [];
let done = 0, errors = 0;
const POOL = 6;
async function worker(queue) {
  for (;;) {
    const l = queue.pop();
    if (!l) return;
    try {
      const v = await classify(l);
      out.push({ ...l, ...v });
    } catch (e) {
      errors++; out.push({ ...l, verdict: 'uncertain', facility_type: 'unknown', confidence: 0, reason: 'error:' + String(e).slice(0, 60) });
    }
    if (++done % 50 === 0) console.log(`  …${done}/${L.length}`);
  }
}
const q = [...L];
await Promise.all(Array.from({ length: POOL }, () => worker(q)));

// report
const by = (v) => out.filter((r) => r.verdict === v);
console.log(`\n=== TOUCHLESS AUTHENTICITY (${out.length} winners, ${errors} errors) ===`);
console.log('confirmed_touchless:', by('confirmed_touchless').length);
console.log('NOT_touchless:      ', by('not_touchless').length);
console.log('uncertain:          ', by('uncertain').length);
const ft = {}; out.forEach((r) => { ft[r.facility_type] = (ft[r.facility_type] || 0) + 1; });
console.log('facility types:', JSON.stringify(ft));

writeFileSync('scripts/_qa-touchless-authenticity.csv',
  'name,city,state,chain,verdict,facility_type,confidence,reason,trophies,tss\n' +
  out.map((r) => [r.name, r.city, r.state, r.parent_chain || '', r.verdict, r.facility_type, r.confidence,
    `"${(r.reason || '').replace(/"/g, "'")}"`, `"${meta.get(r.id).join('; ')}"`, r.touchless_satisfaction_score ?? ''].join(',')).join('\n'));

console.log('\n=== FLAGGED: NOT touchless (review these — remove from awards) ===');
for (const r of by('not_touchless').sort((a, b) => b.confidence - a.confidence))
  console.log(`  [${r.facility_type} ${r.confidence}] ${r.name} — ${r.city},${r.state} :: ${r.reason}`);
console.log('\n=== UNCERTAIN (need a closer look) ===');
for (const r of by('uncertain').slice(0, 40))
  console.log(`  ${r.name} — ${r.city},${r.state} :: ${r.reason}`);
console.log('\nFull CSV → scripts/_qa-touchless-authenticity.csv');
