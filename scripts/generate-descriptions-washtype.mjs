/**
 * Wash-type-aware AI descriptions for hand-wash / self-serve listings (the touchless
 * generate-descriptions edge function targets is_touchless + writes touch-free copy, which is
 * wrong for these). Writes a short factual paragraph from the listing's OWN data — name, city,
 * wash type, amenities (fill these FIRST), packages, rating, hours, a couple review snippets.
 * NEVER uses "touchless / touch-free / brushless / paint-safe" wording. Only fills empty
 * descriptions; never touches classification.
 *
 *   node scripts/generate-descriptions-washtype.mjs             # DRY RUN sample
 *   node scripts/generate-descriptions-washtype.mjs --apply
 *   --hand-wash | --self-serve   restrict (default both)   --limit=N
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const AKEY = env.ANTHROPIC_API_KEY;
const APPLY = process.argv.includes('--apply');
const arg = (f, d) => { const a = process.argv.find(x => x.startsWith(f + '=')); return a ? a.split('=')[1] : d; };
const LIMIT = parseInt(arg('--limit', '0'), 10);
const ONLY = process.argv.includes('--hand-wash') ? 'hand' : process.argv.includes('--self-serve') ? 'self' : process.argv.includes('--detailing') ? 'detail' : 'both';
const POOL = 4, sleep = ms => new Promise(r => setTimeout(r, ms));

const BANNED = /touch[\s-]?less|touch[\s-]?free|brushless|no[\s-]?touch|paint[\s-]?safe/i;

async function haiku(l, reviews) {
  const handWash = l.is_hand_wash && !l.is_self_service && !l.is_touchless;
  // Detailing-only takes precedence for the copy when it's not a hand-wash/self-serve/touchless.
  const detailing = l.is_detailing && !l.is_hand_wash && !l.is_self_service && !l.is_touchless;
  const selfServe = l.is_self_service && !l.is_hand_wash && !l.is_touchless && !detailing;
  const kind = handWash ? 'a full-service HAND car wash where trained attendants wash the vehicle BY HAND (and often detail it)'
    : detailing ? 'a professional AUTO DETAILING business — deep reconditioning like paint correction, ceramic coating, paint protection film (PPF), and full interior detailing (NOT a routine wash)'
    : selfServe ? 'a SELF-SERVICE car wash where the customer washes their own vehicle in open coin/card wand bays'
    : 'a car wash';
  const facts = [
    `Name: ${l.name}`, `Location: ${l.city}, ${l.state}`,
    l.rating ? `Google rating: ${l.rating}★ (${l.review_count || 0} reviews)` : null,
    (l.amenities && l.amenities.length) ? `Amenities/services: ${l.amenities.join(', ')}` : null,
    (Array.isArray(l.wash_packages) && l.wash_packages.length) ? `Packages: ${l.wash_packages.map(p => p.name + (p.price ? ` (${p.price})` : '')).join(', ')}` : null,
    reviews.length ? `What customers say: ${reviews.slice(0, 3).map(r => `"${r.slice(0, 160)}"`).join(' ')}` : null,
  ].filter(Boolean).join('\n');
  const sys = `You write a concise, factual 2–4 sentence directory description for ${kind}. Use ONLY the facts provided — do not invent hours, prices, or services. Write in a neutral, informative tone (third person). ${handWash ? 'Emphasize the hand washing / attention / detailing. ' : detailing ? 'Emphasize the detailing services (correction, coatings, PPF, interior). ' : selfServe ? 'Emphasize the DIY wand-bay self-service. ' : ''}NEVER use the words "touchless", "touch-free", "brushless", "no-touch", or "paint-safe" — ${handWash ? 'a hand wash involves hand contact' : detailing ? 'this is a detailer, not a touchless wash' : selfServe ? 'this is a self-service wash' : ''}. Output ONLY the description text, no preamble.`;
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 320, system: sys, messages: [{ role: 'user', content: facts }] }) });
  if (!res.ok) throw new Error(res.status + ' ' + (await res.text()).slice(0, 120));
  return ((await res.json()).content?.[0]?.text ?? '').trim();
}

let targets = [];
for (let from = 0; ; from += 1000) {
  let q = db.from('listings').select('id,name,city,state,rating,review_count,amenities,wash_packages,is_hand_wash,is_self_service,is_detailing,is_touchless').or('description.is.null,description.eq.');
  // Detailing is PRE-LAUNCH: its listings are mostly is_approved=false (pending manual review),
  // so enrich them regardless of approval. Other (live) categories keep the is_approved gate.
  if (ONLY !== 'detail') q = q.eq('is_approved', true);
  if (ONLY === 'hand') q = q.eq('is_hand_wash', true);
  else if (ONLY === 'self') q = q.eq('is_self_service', true);
  else if (ONLY === 'detail') q = q.eq('is_detailing', true);
  else q = q.or('is_hand_wash.eq.true,is_self_service.eq.true,is_detailing.eq.true');
  const { data } = await q.order('id').range(from, from + 999);
  if (!data?.length) break;
  targets.push(...data);
  if (data.length < 1000) break;
}
// Skip mixed touchless listings — those keep the touchless generator/copy.
targets = targets.filter(l => !l.is_touchless);
if (LIMIT) targets = targets.slice(0, LIMIT);
console.log(`${targets.length} listings missing a description | ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

let wrote = 0, thin = 0, banned = 0, errs = 0;
async function worker(queue) {
  for (;;) {
    const l = queue.pop(); if (!l) return;
    try {
      const { data: snips } = await db.from('review_snippets').select('review_text').eq('listing_id', l.id).not('review_text', 'is', null).limit(6);
      const reviews = (snips || []).map(s => (s.review_text || '').replace(/\s+/g, ' ').trim()).filter(t => t.length > 20);
      // Need at least SOMETHING beyond name+city (amenities or reviews) or the description is fluff.
      if (!reviews.length && !(l.amenities && l.amenities.length)) { thin++; continue; }
      const desc = await haiku(l, reviews);
      if (!desc || desc.length < 40) { thin++; continue; }
      if (BANNED.test(desc)) { banned++; console.log(`  ⚠ ${(l.name || '').slice(0, 30)}: model used banned touchless wording — skipped`); continue; }
      if (wrote < 8) console.log(`  ✓ ${(l.name || '').slice(0, 32)}:\n     ${desc.replace(/\s+/g, ' ').slice(0, 220)}\n`);
      if (APPLY) { const { error } = await db.from('listings').update({ description: desc }).eq('id', l.id); if (error) throw error; }
      wrote++;
    } catch (e) { errs++; if (errs <= 5) console.log(`  ❌ ${(l.name || '').slice(0, 30)}: ${String(e.message || e).slice(0, 50)}`); }
    await sleep(120);
  }
}
const q = [...targets];
await Promise.all(Array.from({ length: POOL }, () => worker(q)));
console.log(`\nDONE: ${wrote} ${APPLY ? 'written' : 'would write'} | ${thin} skipped (too thin) | ${banned} skipped (banned wording) | ${errs} errors`);
