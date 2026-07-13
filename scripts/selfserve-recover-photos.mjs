/**
 * Recover photos dropped by the autophoto hero-dedup filename bug (a blanket
 * /hero-cropped/ regex deleted mixed listings' DISTINCT old touchless heroes from
 * the gallery). Restores the missing ORIGINAL (non-ai) photos into the `photos`
 * array as GALLERY images ONLY — it NEVER touches hero_image. Sources the original
 * photo list from the earliest _backup_autophoto_hero_<STATE>_*.json per listing,
 * verifies each URL still resolves in storage, and appends the survivors.
 *   node scripts/selfserve-recover-photos.mjs CO         # dry-run (show what returns)
 *   node scripts/selfserve-recover-photos.mjs CO --run   # apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, writeFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const STATE = (process.argv[2] || 'CO').toUpperCase();
const RUN = process.argv.includes('--run');

// Earliest backup per listing id = the ORIGINAL photo set before autophoto touched it.
const backups = readdirSync('scripts').filter((f) => new RegExp(`_backup_autophoto_hero_${STATE}_`).test(f)).sort();
const orig = {};
for (const bf of backups) {
  const arr = JSON.parse(readFileSync('scripts/' + bf, 'utf8'));
  for (const e of arr) {
    if (!orig[e.id]) orig[e.id] = { name: e.name, photos: [...(e.prev_photos || []), e.prev_hero_image].filter(Boolean) };
  }
}
const ids = Object.keys(orig);
console.log(`${STATE}: ${ids.length} listings have autophoto backups; checking for dropped original photos…\n`);

async function urlOk(u) {
  try { const r = await fetch(u, { method: 'GET' }); return r.ok && (r.headers.get('content-type') || '').startsWith('image'); }
  catch { return false; }
}

let touched = 0, restoredTotal = 0, deadTotal = 0;
const undo = []; // {id, photos_before} for reversibility

for (const id of ids) {
  const { data } = await sb.from('listings').select('name, photos, hero_image').eq('id', id).maybeSingle();
  if (!data) continue;
  const current = data.photos || [];
  const currentSet = new Set([...current, data.hero_image].filter(Boolean));
  // Dropped = original photos that are (a) NOT ai-generated, (b) not already present
  // (gallery or hero). These are the curated originals the bug removed.
  const dropped = orig[id].photos.filter((u) => !currentSet.has(u) && !u.includes('/ai-'));
  if (!dropped.length) continue;
  // Verify each still resolves in storage before restoring (skip dead links).
  const alive = [];
  for (const u of dropped) { if (await urlOk(u)) alive.push(u); else deadTotal++; }
  if (!alive.length) { console.log(`  • ${data.name}: ${dropped.length} dropped but none resolve (skip)`); continue; }
  // Append to the GALLERY only — hero_image is never touched. Dedupe defensively.
  const newPhotos = [...current, ...alive].filter((u, i, a) => u && a.indexOf(u) === i);
  console.log(`  • ${data.name}: restoring ${alive.length} gallery photo(s)${alive.length < dropped.length ? ` (${dropped.length - alive.length} dead skipped)` : ''} → photos ${current.length} → ${newPhotos.length} (hero unchanged)`);
  touched++; restoredTotal += alive.length;
  if (RUN) {
    undo.push({ id, name: data.name, photos_before: current });
    const { error } = await sb.from('listings').update({ photos: newPhotos }).eq('id', id); // hero_image intentionally NOT updated
    if (error) console.log(`      ⚠ update failed: ${error.message}`);
  }
}

console.log(`\n${RUN ? 'RESTORED' : 'WOULD RESTORE'}: ${restoredTotal} gallery photo(s) across ${touched} listings${deadTotal ? ` (${deadTotal} dead URLs skipped)` : ''}.`);
if (RUN && undo.length) {
  const f = `scripts/_backup_recover_photos_${STATE}_${Date.now()}.json`;
  writeFileSync(f, JSON.stringify(undo, null, 2));
  console.log(`Pre-recovery photos backed up (reversible): ${f}`);
}
if (!RUN) console.log('\nDry run. Re-run with --run to apply (gallery only; hero untouched).');
