/**
 * Tag self-serve listings using ONLY evidence we already own — $0, no API calls.
 *
 * The listings table is a paid Outscraper export of every US car wash, so the job is
 * never acquisition, it's classification. Two signals are already sitting in columns:
 *   1. google_category / google_subtypes == "Self service car wash"  (Google's own label)
 *   2. name contains "self serv" or "coin"   (the only name tokens that tested reliable:
 *      97% and 90% precision; every other token — suds/splash/bubble/spray — is a coin flip)
 *
 * Google's label is wrong about a THIRD of the time here: it calls Quick Quack, Tidal Wave
 * and Caliber "self service car wash" when they're conveyor tunnels. So two guards run
 * before anything is tagged, and whatever they catch is held for a human, not discarded.
 *
 * Guards (both \b-anchored — an unanchored /go car ?wash/ ate "WinnebaGO CAR WASH" and
 * /el car ?wash/ ate "AvenEL CAR WASH" in testing):
 *   - CHAIN: known conveyor/tunnel brands, never self-serve regardless of Google's label.
 *   - EXCL:  Michael's rule — "express"/"auto spa"/"tunnel" in a name is almost always NOT
 *     self-serve. It's a PRIOR, not a verdict: a name that also says "self serv" outright
 *     wins (real row: "Oasis Auto Spa, Self Serve Car Wash and Detailing").
 *
 * Tagging is additive and invisible: it sets is_self_service only. is_approved is untouched,
 * and self_service_reviewed_at is deliberately left NULL so photo-autopilot still picks these
 * up for hero/wash-type verification.
 *
 *   node scripts/selfserve-tag-from-owned-data.mjs           # dry run
 *   node scripts/selfserve-tag-from-owned-data.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

const CAT_FILTER  = 'google_category.ilike.%self service%,google_subtypes.ilike.%self service%';
const NAME_FILTER = 'name.ilike.%self serv%,name.ilike.%self-serv%,name.ilike.%coin%';

const CHAIN = /\b(tidal wave|whistle express|mister car ?wash|quick quack|tommy'?s express|take 5|zips? car ?wash|club car ?wash|super ?star car ?wash|autobell|el car ?wash|splash ?in|go car ?wash|crew car ?wash|delta sonic|flagstop|rocket car ?wash|caliber car ?wash|jax kar ?wash|sparkling image)\b/i;
const EXCL     = /\b(express|auto spa|tunnel)\b/i;
const SELFSERV = /self[\s-]?serv/i;

// Page explicitly and check every error: an unpaginated select silently caps at 1000, and a
// swallowed error reads as "nothing to do" — that combination already cost a whole run today.
async function fetchAll(build) {
  const out = [];
  for (let page = 0; ; page++) {
    const { data, error } = await build(
      sb.from('listings').select('id,name,google_category,google_subtypes')
    ).order('id').range(page * 1000, page * 1000 + 999);
    if (error) { console.error(`\n⛔ query failed (page ${page}): ${error.message}\nAborting rather than reporting an empty result.`); process.exit(1); }
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const byCat  = await fetchAll(q => q.is('is_self_service', null).or(CAT_FILTER));
const byName = await fetchAll(q => q.is('is_self_service', null).or(NAME_FILTER));

const candidates = new Map();
for (const r of byCat)  candidates.set(r.id, { ...r, via: 'google_category' });
for (const r of byName) candidates.set(r.id, { ...candidates.get(r.id) ?? r, via: candidates.has(r.id) ? 'category+name' : 'name' });

const tag = [], heldChain = [], heldRule = [];
for (const r of candidates.values()) {
  const n = r.name || '';
  if (CHAIN.test(n))                      heldChain.push(r);
  else if (EXCL.test(n) && !SELFSERV.test(n)) heldRule.push(r);
  else                                    tag.push(r);
}

console.log(`\ncandidates from owned data ....... ${candidates.size}`);
console.log(`  by Google category ............. ${byCat.length}`);
console.log(`  by name (self serv / coin) ..... ${byName.length}`);
console.log(`\n  − known tunnel chain ........... ${heldChain.length}  (Google mislabels these)`);
console.log(`  − express/auto spa/tunnel rule .. ${heldRule.length}`);
console.log(`  ✅ TAG .......................... ${tag.length}`);
// Every candidate must land in exactly one bucket, or a silent path exists.
const sum = tag.length + heldChain.length + heldRule.length;
if (sum !== candidates.size) { console.error(`⛔ ${candidates.size - sum} candidates unaccounted for — silent path, aborting.`); process.exit(1); }

if (!APPLY) {
  console.log('\nsample to tag:');   tag.slice(0, 8).forEach(r => console.log(`  • ${r.name}  [${r.via}]`));
  console.log('\nsample held (chain):'); heldChain.slice(0, 5).forEach(r => console.log(`  • ${r.name}`));
  console.log('\n(dry run — pass --apply)');
  process.exit(0);
}

const stamp = Date.now();
writeFileSync(`scripts/_backup_selfserve_tag_${stamp}.json`,
  JSON.stringify(tag.map(r => ({ id: r.id, name: r.name, prev_is_self_service: null, via: r.via })), null, 2));
writeFileSync(`scripts/_held_selfserve_review_${stamp}.json`,
  JSON.stringify({ chain: heldChain.map(r => ({ id: r.id, name: r.name })), rule: heldRule.map(r => ({ id: r.id, name: r.name })) }, null, 2));

let ok = 0, failed = 0;
for (const r of tag) {
  const { error } = await sb.from('listings').update({
    is_self_service: true,
    self_service_source: r.via === 'name' ? 'name' : 'google_category',
    // reviewed_at stays NULL on purpose → photo-autopilot still picks these up.
  }).eq('id', r.id);
  if (error) { failed++; console.log(`  ⚠ ${r.name}: ${error.message}`); } else ok++;
}
console.log(`\ntagged ${ok}${failed ? ` | FAILED ${failed}` : ''}`);
console.log(`backup: scripts/_backup_selfserve_tag_${stamp}.json (reversible)`);
console.log(`held for review: scripts/_held_selfserve_review_${stamp}.json (${heldChain.length + heldRule.length})`);
