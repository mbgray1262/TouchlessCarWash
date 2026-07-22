/**
 * Self-serve review-queue cleanup — get the junk out of Michael's queue.
 *
 * WHY: the queue was filled from several sources, only ONE of which was ever checked by vision:
 *   triage_selfserve / chain_selfserve  → AI- or chain-verified   (KEEP — never touched here)
 *   osm_self_service                    → raw OpenStreetMap `self_service=yes` tag  (UNVERIFIED)
 *   google_category / name / autopilot_*→ category- or name-matched               (UNVERIFIED)
 * A 30-listing vision audit of the OSM bucket found only 13% were real self-serve — i.e. the
 * reviewer weeds through ~7 duds per hit. This pass removes the ones we can rule out for FREE
 * from the name alone (gas stations, detail/tint shops, tunnel chains, truck washes).
 *
 * SAFETY:
 *  - Only touches rows with self_service_reviewed_at IS NULL → never public (see lib/self-serve.ts),
 *    so nothing can vanish from the live site.
 *  - Never touches is_approved or is_touchless.
 *  - Never touches the verified buckets (triage_selfserve / chain_selfserve / admin_review).
 *  - Tags what it demotes with a distinct source so the action is fully reversible/auditable.
 *
 *   node scripts/clean-selfserve-queue.mjs            # dry run — shows the impact
 *   node scripts/clean-selfserve-queue.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { nameVerdict } from './selfserve-name-filters.mjs';

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

// The UNVERIFIED sources only. triage_selfserve / chain_selfserve / admin_review are excluded
// by construction — a human or vision already vouched for those.
const UNVERIFIED = ['osm_self_service','google_category','name','autopilot_ok','autopilot_exception'];

let rows = [], from = 0;
while (true) {
  const { data, error } = await sb.from('listings')
    .select('id,name,city,state,self_service_source')
    .eq('is_self_service', true).is('self_service_reviewed_at', null)
    .in('self_service_source', UNVERIFIED)
    .range(from, from + 999);
  if (error) { console.error(error.message); process.exit(1); }
  rows = rows.concat(data || []);
  if (!data || data.length < 1000) break;
  from += 1000;
}
console.log(`Queue cleanup — ${rows.length} unverified listings | ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

const hits = [];
for (const l of rows) {
  const nv = nameVerdict(l.name);
  if (nv) hits.push({ ...l, ...nv });
}

const byReason = {};
for (const h of hits) byReason[h.reason] = (byReason[h.reason] || 0) + 1;
console.log('=== REMOVABLE BY NAME ALONE (free, no AI) ===');
Object.entries(byReason).sort((a,b)=>b[1]-a[1]).forEach(([r,n]) => console.log(`${String(n).padStart(5)}  ${r}`));
console.log(`${String(hits.length).padStart(5)}  TOTAL removable`);
console.log(`${String(rows.length - hits.length).padStart(5)}  remain (need photo/vision check)\n`);

console.log('--- sample of what gets removed ---');
hits.slice(0, 15).forEach(h => console.log(`  ${h.name} (${h.city}, ${h.state}) — ${h.reason}`));

if (APPLY) {
  let done = 0;
  for (const h of hits) {
    // Truck washes keep their own tag so a future truck category can pull them back.
    const source = h.verdict === 'truck' ? 'truck_wash' : 'queue_cleanup_name';
    const { error } = await sb.from('listings')
      .update({ is_self_service: false, self_service_source: source })
      .eq('id', h.id);
    if (error) { console.error(`FAIL ${h.id}: ${error.message}`); continue; }
    done++;
    if (done % 100 === 0) console.log(`  …${done}/${hits.length}`);
  }
  console.log(`\nAPPLIED: ${done} removed from the queue.`);
} else {
  console.log('\n(dry run — re-run with --apply to remove these)');
}
