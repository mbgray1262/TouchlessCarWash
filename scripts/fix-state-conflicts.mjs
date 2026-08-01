/**
 * Resolve the wrong-state quarantine from the address backfill: for each listing whose
 * COORDINATE resolved to a different (real, street-addressed) US state than its stored state,
 * fix state/city/zip/address to match the coordinate. The coordinate is authoritative — it
 * drives Street View (the real building) and reverse-geocoded to a real address that matches
 * the business (e.g. Fred's Car Wash → CT, not the imported NY). Michael approved
 * fixing-from-coordinate after the cluster evidence (MI→WI 82, NY→PA 33, …).
 *
 * SAFE:
 *   - only records with a real street address (geo_address present) — vague ones are skipped.
 *   - geo_state must be a valid US state.
 *   - re-reads each listing and only updates if its state is STILL the old db_state (never
 *     clobbers a value changed since the quarantine snapshot).
 *   - throttled writes (Micro DB).
 *
 *   node scripts/fix-state-conflicts.mjs           # DRY RUN (counts + sample)
 *   node scripts/fix-state-conflicts.mjs --apply   # write
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const US_STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));

const conflicts = JSON.parse(readFileSync('scripts/_address_state_conflicts.json', 'utf8'));
const eligible = conflicts.filter(c => c.geo_address && c.geo_state && US_STATES.has(c.geo_state));
console.log(`${conflicts.length} quarantined | ${eligible.length} eligible (real street + valid US state) | ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

let fixed = 0, skippedChanged = 0, errs = 0;
for (const c of eligible) {
  try {
    const { data: cur } = await sb.from('listings').select('state').eq('id', c.id).maybeSingle();
    if (!cur) { continue; }
    if ((cur.state || '').trim().toUpperCase() !== (c.db_state || '').trim().toUpperCase()) {
      skippedChanged++;   // state already changed since the snapshot — don't clobber
      continue;
    }
    const upd = { state: c.geo_state, address: c.geo_address };
    if (c.city) upd.city = c.city;
    if (c.zip) upd.zip = c.zip;
    if (fixed < 15) console.log(`  ${c.db_state}→${c.geo_state}  ${(c.name || '').slice(0, 34).padEnd(35)} ${c.geo_address}${c.city ? ', ' + c.city : ''} ${c.zip || ''}`);
    if (APPLY) { const { error } = await sb.from('listings').update(upd).eq('id', c.id); if (error) throw error; await sleep(40); }
    fixed++;
  } catch (e) { errs++; console.log(`  ❌ ${(c.name || '').slice(0, 30)}: ${String(e.message || e).slice(0, 50)}`); }
}
console.log(`\nDONE: ${fixed} ${APPLY ? 'fixed' : 'would fix'} | ${skippedChanged} skipped (state changed since snapshot) | ${errs} errors`);
