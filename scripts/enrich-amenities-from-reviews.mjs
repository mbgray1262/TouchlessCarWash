/**
 * Amenity backfill for hand-wash / self-serve listings that Crawl4AI couldn't enrich (no
 * website, or a sparse/dead site). Infers amenities from the review snippets we already mined
 * (+ Google category + name) using Haiku, constrained to a FIXED vocabulary so output stays
 * consistent and nothing is hallucinated — the model only returns amenities the reviews clearly
 * support. Never sets touchless flags; only writes listings.amenities when currently empty.
 *
 *   node scripts/enrich-amenities-from-reviews.mjs            # DRY RUN sample
 *   node scripts/enrich-amenities-from-reviews.mjs --apply    # write
 *   --hand-wash | --self-serve   restrict (default: both)   --limit=N
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

// FIXED amenity vocabulary — the model may ONLY return items from this list.
const VOCAB = [
  // self-serve / general
  'Free Vacuum', 'Self-Serve Bays', 'Vending', 'Air Freshener', 'Open 24 Hours', 'Tire Shine',
  'Spot Free Rinse', 'Undercarriage Wash', 'Foam Brush', 'Triple Foam', 'Hot Wax', 'Rain-X',
  'Unlimited Wash Club', 'Pet Wash', 'RV Wash', 'Truck Wash', 'Fleet Service',
  // hand-wash / detailing
  'Hand Wash', 'Hand Dry', 'Interior Cleaning', 'Full Detailing', 'Paint Correction', 'Clay Bar',
  'Ceramic Coating', 'Paint Protection Film', 'Waxing', 'Engine Cleaning', 'Headlight Restoration',
  'Pet Hair Removal', 'Leather Conditioning', 'Odor Removal', 'Waiting Lounge', 'Free WiFi', 'Shuttle Service',
];
const VOCAB_SET = new Set(VOCAB);

async function haiku(name, washType, category, reviews) {
  const sys = `You extract amenities/services for a ${washType} car wash listing from customer reviews. Return ONLY amenities that the reviews (or an obvious category signal) clearly support — a customer mentioned it, or it's unmistakable. Do NOT guess or pad. You may ONLY use items from this EXACT list (copy the strings verbatim):\n${VOCAB.join(', ')}\nReturn ONLY a JSON array of the supported strings (e.g. ["Hand Wash","Interior Cleaning"]). If nothing is clearly supported, return [].`;
  const user = `Business: ${name}\nGoogle category: ${category || 'Car wash'}\nCustomer reviews:\n${reviews.map((r, i) => `${i + 1}. ${r.slice(0, 300)}`).join('\n')}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 300, system: sys, messages: [{ role: 'user', content: user }] }) });
  if (!res.ok) throw new Error(res.status + ' ' + (await res.text()).slice(0, 120));
  const txt = (await res.json()).content?.[0]?.text ?? '';
  const m = txt.match(/\[[\s\S]*\]/);
  const arr = m ? JSON.parse(m[0]) : [];
  return [...new Set(arr.filter(a => VOCAB_SET.has(a)))].slice(0, 10); // keep only valid vocab
}

// Targets: approved hand-wash/self-serve listings with no amenities.
let targets = [];
for (let from = 0; ; from += 1000) {
  let q = db.from('listings').select('id,name,is_hand_wash,is_self_service,is_detailing,google_category').eq('is_approved', true).or('amenities.is.null,amenities.eq.{}');
  if (ONLY === 'hand') q = q.eq('is_hand_wash', true);
  else if (ONLY === 'self') q = q.eq('is_self_service', true);
  else if (ONLY === 'detail') q = q.eq('is_detailing', true);
  else q = q.or('is_hand_wash.eq.true,is_self_service.eq.true,is_detailing.eq.true');
  const { data } = await q.order('id').range(from, from + 999);
  if (!data?.length) break;
  targets.push(...data);
  if (data.length < 1000) break;
}
if (LIMIT) targets = targets.slice(0, LIMIT);
console.log(`${targets.length} listings missing amenities | ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

let wrote = 0, noEvidence = 0, errs = 0;
async function worker(queue) {
  for (;;) {
    const l = queue.pop(); if (!l) return;
    try {
      const { data: snips } = await db.from('review_snippets').select('review_text').eq('listing_id', l.id).not('review_text', 'is', null).limit(14);
      const reviews = (snips || []).map(s => (s.review_text || '').replace(/\s+/g, ' ').trim()).filter(t => t.length > 15);
      if (reviews.length < 2) { noEvidence++; continue; }               // not enough to infer honestly
      const washType = l.is_detailing && !l.is_hand_wash && !l.is_self_service ? 'AUTO DETAILING (paint correction, ceramic, PPF, full interior/exterior detail)' : l.is_hand_wash && !l.is_self_service ? 'HAND (attendants wash by hand + detailing)' : l.is_self_service && !l.is_hand_wash ? 'SELF-SERVE (customer washes own car in coin/wand bays)' : 'car';
      const amenities = await haiku(l.name, washType, l.google_category, reviews);
      if (!amenities.length) { noEvidence++; continue; }
      if (wrote < 20) console.log(`  ✓ ${(l.name || '').slice(0, 36).padEnd(37)} → ${JSON.stringify(amenities)}`);
      if (APPLY) { const { error } = await db.from('listings').update({ amenities }).eq('id', l.id); if (error) throw error; }
      wrote++;
    } catch (e) { errs++; if (errs <= 5) console.log(`  ❌ ${(l.name || '').slice(0, 30)}: ${String(e.message || e).slice(0, 50)}`); }
    await sleep(120);
  }
}
const q = [...targets];
await Promise.all(Array.from({ length: POOL }, () => worker(q)));
console.log(`\nDONE: ${wrote} ${APPLY ? 'written' : 'would write'} | ${noEvidence} skipped (too little review evidence) | ${errs} errors`);
