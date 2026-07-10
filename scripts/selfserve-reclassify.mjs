/**
 * RECLASSIFY self-serve tags by confidence, so is_self_service=true means
 * "confirmed self-serve" rather than "matched a fuzzy Google text search".
 *
 * For every listing currently is_self_service=true, decide a provenance:
 *   google_category / name / website  -> CONFIRMED  (keep is_self_service=true)
 *   junk                              -> not self-serve (is_self_service=false)
 *   harvest_unconfirmed               -> ambiguous, needs a vision pass
 *                                        (is_self_service=false, but marked so the
 *                                         vision step can find & promote the real ones)
 *
 * Writes self_service_source on every row. Backs up the full prior state first
 * (id + is_self_service + self_service_source) so it is fully reversible.
 * Never touches is_touchless / is_approved / self_service_reviewed_at / hero_image.
 *
 * Run: node scripts/selfserve-reclassify.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Category / subtypes explicitly say self-serve (Google's own business label).
const CAT_SELF = /self.?serv/i;
// Name self-identifies — high precision. Overrides a junk category (a gas station
// genuinely named "...Self Serve Car Wash" is self-serve).
const NAME_SELF = /\b(self[\s-]?serv\w*|coin[\s-]?op\w*|wand wash|do[\s-]?it[\s-]?yourself)\b/i;
// Website / snapshot text: require the self-serve phrase to sit next to wash/bay/wand
// so "self serve GAS" (the #1 Car Wash & Gas false-positive class) doesn't confirm.
const WEB_SELF = /(self[\s-]?serv\w*|self[\s-]?service)[\s\w,'-]{0,25}(wash|bay|wand)|(wash|bay|wand)[\s\w,'-]{0,25}(self[\s-]?serv\w*)|coin[\s-]?op\w*[\s\w,'-]{0,20}(wash|bay)|\bwand bays?\b|\bself[\s-]?serve bays?\b/i;
// Google categorizes it as something that is NOT a self-serve car wash.
const JUNK_CAT = /gas station|gas_station|convenience|laundr|oil change|repair|smog|detailing|truck stop/i;

const snapText = (r) => {
  let s = '';
  if (r.crawl_snapshot) s += JSON.stringify(r.crawl_snapshot).slice(0, 30000);
  if (r.google_description) s += ' ' + r.google_description;
  return s;
};

// load all currently-tagged self-serve
const rows = []; { let from = 0; while (true) { const { data } = await sb.from('listings').select('id,name,google_category,google_subtypes,google_description,crawl_snapshot,is_self_service,self_service_source').eq('is_self_service', true).order('id').range(from, from + 999); if (!data || !data.length) break; rows.push(...data); from += data.length; if (data.length < 1000) break; } }
console.log('Currently is_self_service=true:', rows.length.toLocaleString());

// backup
writeFileSync(`scripts/_backup_selfserve_reclassify_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(rows.map(r => ({ id: r.id, is_self_service: true, self_service_source: r.self_service_source ?? null })), null, 2));

const buckets = { google_category: [], name: [], website: [], junk: [], harvest_unconfirmed: [] };
for (const r of rows) {
  const catBlob = `${r.google_category || ''} ${JSON.stringify(r.google_subtypes || '')}`;
  if (CAT_SELF.test(catBlob)) buckets.google_category.push(r.id);
  else if (NAME_SELF.test(r.name || '')) buckets.name.push(r.id);
  else if (JUNK_CAT.test(r.google_category || '')) buckets.junk.push(r.id);
  else if (WEB_SELF.test(snapText(r))) buckets.website.push(r.id);
  else buckets.harvest_unconfirmed.push(r.id);
}

const CONFIRMED = ['google_category', 'name', 'website'];
const applyUpdate = async (ids, source, keepTag) => {
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const patch = keepTag ? { self_service_source: source } : { is_self_service: false, self_service_source: source };
    const { error } = await sb.from('listings').update(patch).in('id', chunk);
    if (error) { console.log('  ERR', source, error.message); return; }
  }
};

for (const [source, ids] of Object.entries(buckets)) {
  const keep = CONFIRMED.includes(source);
  await applyUpdate(ids, source, keep);
}

console.log('\n==================== RECLASSIFY DONE ====================');
const confirmedTotal = CONFIRMED.reduce((n, k) => n + buckets[k].length, 0);
console.log('🟢 CONFIRMED self-serve (is_self_service stays TRUE):', confirmedTotal.toLocaleString());
console.log('   ├─ google_category:', buckets.google_category.length.toLocaleString());
console.log('   ├─ name self-identifies:', buckets.name.length.toLocaleString());
console.log('   └─ website/snapshot text:', buckets.website.length.toLocaleString());
console.log('🔴 JUNK (untagged, is_self_service=false):', buckets.junk.length.toLocaleString());
console.log('🟡 HARVEST_UNCONFIRMED (untagged, awaiting vision):', buckets.harvest_unconfirmed.length.toLocaleString());
console.log('\nis_self_service=true is now the', confirmedTotal.toLocaleString(), 'confirmed set. Ambiguous pool recoverable via self_service_source=harvest_unconfirmed.');
