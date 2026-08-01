import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

let rows = [];
for (let from = 0; ; from += 1000) {
  const { data } = await sb.from('listings').select('id,name,google_category,google_subtypes,review_count,website,is_hand_wash')
    .not('google_place_id', 'is', null).or('google_category.ilike.*detail*,google_subtypes.ilike.*detail*').order('id').range(from, from + 999);
  if (!data?.length) break; rows.push(...data); if (data.length < 1000) break;
}
const DEALER = /\b(dealer|dealership|hyundai|toyota|honda|ford|chevrolet|chevy|nissan|kia|mazda|subaru|bmw|mercedes|lexus|audi|volkswagen|vw|jeep|dodge|ram|gmc|buick|cadillac|chrysler|acura|infiniti|volvo|jaguar|land rover|mitsubishi|genesis)\b/i;
const OTHERNOISE = /\b(oil change|jiffy lube|valvoline|lube|tires?|body shop|collision|auto repair|mechanic|smog|gas station|used cars?)\b/i;
const MOBILE = /\bmobile\b|a\s?domicilio/i;
const DETAIL_CAT = /detail/i;
const CARWASH_CAT = /car\s?wash/i;
const DETAIL_NAME = /\bdetail|auto\s?spa|ceramic|\bppf\b|paint\s?(protection|correction)|\bwrap/i;

const b = { dealer: [], othernoise: [], mobile: [], detailer_cat: [], detailer_name: [], carwash: [], uncertain: [] };
for (const r of rows) {
  const nm = r.name || '', cat = r.google_category || '', hasDetailName = DETAIL_NAME.test(nm);
  if ((DEALER.test(nm) || DEALER.test(cat) || OTHERNOISE.test(nm) || OTHERNOISE.test(cat)) && !hasDetailName) { b.dealer.push(r); continue; }
  if (MOBILE.test(nm)) { b.mobile.push(r); continue; }
  if (DETAIL_CAT.test(cat)) { b.detailer_cat.push(r); continue; }
  if (hasDetailName) { b.detailer_name.push(r); continue; }
  if (CARWASH_CAT.test(cat)) { b.carwash.push(r); continue; }
  b.uncertain.push(r);
}
const n = k => b[k].length;
console.log(`TOTAL candidates: ${rows.length}\n=== BUCKETS ===`);
console.log(`  🚫 Dealership/dealer-brand:        ${n('dealer')}   (exclude)`);
console.log(`  🚫 Oil change / tire / body / etc: ${n('othernoise')}   (exclude)`);
console.log(`  📱 Mobile detailer:                ${n('mobile')}   (include? — no storefront)`);
console.log(`  ✅ Detailer — by PRIMARY category:  ${n('detailer_cat')}   (strong: dedicated detailer)`);
console.log(`  ✅ Detailer — by NAME:              ${n('detailer_name')}`);
console.log(`  💧 Car wash (details as add-on):    ${n('carwash')}   (belongs in wash categories)`);
console.log(`  ❓ Uncertain:                       ${n('uncertain')}`);
const core = n('detailer_cat') + n('detailer_name');
const withRev = k => b[k].filter(r => (r.review_count || 0) > 4).length;
const withSite = k => b[k].filter(r => r.website && r.website.trim()).length;
console.log(`\n  ➜ GENUINE storefront detailers (core): ${core}  | +mobile: ${core + n('mobile')}`);
console.log(`  ➜ core with >4 reviews: ${withRev('detailer_cat') + withRev('detailer_name')}  | core with a website: ${withSite('detailer_cat') + withSite('detailer_name')}`);
console.log('\n=== samples per bucket ===');
for (const k of ['detailer_cat', 'detailer_name', 'mobile', 'dealer', 'carwash', 'uncertain'])
  console.log(` [${k}] ` + b[k].slice(0, 4).map(r => `${(r.name || '').slice(0, 24)} (${(r.google_category || '?').slice(0, 18)})`).join('  |  '));

// --apply: tag the HIGH-CONFIDENCE core (primary Google category = "Car detailing service")
// as is_detailing=true, source google_category. Seeded only — detailing_reviewed_at stays NULL
// so the admin still confirms in the photo-audit tool (same gate as hand-wash). Skips rows
// already tagged is_detailing.
if (process.argv.includes('--apply')) {
  const ids = b.detailer_cat.filter(r => r.is_detailing == null).map(r => r.id);
  console.log(`\nAPPLY: tagging ${ids.length} high-confidence detailers (is_detailing=true, source=google_category)...`);
  let done = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { error } = await sb.from('listings').update({ is_detailing: true, detailing_source: 'google_category' }).in('id', chunk);
    if (error) { console.log('  ⚠', error.message); break; }
    done += chunk.length;
  }
  console.log(`  tagged ${done}.`);
}
