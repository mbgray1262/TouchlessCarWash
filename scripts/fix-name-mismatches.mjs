#!/usr/bin/env node
/**
 * Apply name-mismatch fixes for the safe categories:
 *
 *   1. HOLIDAY_TO_CIRCLE_K  — Holiday Stationstores has been rebranded to
 *      Circle K; Google reports the new name. Update listings.name and
 *      parent_chain; keep slug stable for SEO (URL redirects still work).
 *
 *   2. RENAME_ADOPT_GOOGLE  — our name is generic ("Touchless Car Wash"),
 *      Google has a specific name. Adopt Google's displayName.
 *
 *   3. MANUAL_OVERRIDES     — specific one-off fixes captured here with an
 *      explicit reason (e.g. Cascade/Splash & Dash mix-up in Fairfield OH).
 *
 * We do NOT rename Terrible's rows automatically — many of the Google
 * displayNames for those are generic gas-station or address labels, so the
 * car-wash-specific database name is often more useful to users than what
 * Google returns. Those need manual review.
 *
 * Slug stays stable: Next.js route + sitemap entries continue to work; the
 * old name simply gets replaced in the UI. (Changing slugs would create
 * 404s on any inbound links.)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env = readFileSync(resolve(repoRoot,'.env.local'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const LOG = resolve(repoRoot, 'scripts/fix-name-mismatches.log');
const DRY = process.argv.includes('--dry-run');

function log(m) {
  const line = `[${new Date().toISOString().slice(11,19)}] ${m}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

// One-offs the audit flagged that deserve a specific, reviewed fix.
const MANUAL_OVERRIDES = [
  {
    id: '1fc85a23-9c38-4bae-9cb6-2641aeac89b8',
    from_name: 'Cascade Car Wash',
    to_name: 'Splash & Dash Auto Wash',
    parent_chain: null,
    reason: 'Photos + Google displayName both say Splash & Dash; Cascade was a bad import label. Fairfield OH, 6106 Pleasant Ave.',
  },
];

async function applyRename(l, newName, opts = {}) {
  const patch = { name: newName };
  if (opts.parent_chain !== undefined) patch.parent_chain = opts.parent_chain;
  if (opts.reason) patch.crawl_notes = `[${new Date().toISOString().slice(0,10)}] Name fix: "${l.db_name || l.name}" → "${newName}". ${opts.reason}`;
  if (DRY) {
    log(`  [DRY] ${l.id.slice(0,8)} "${l.db_name || l.name}" → "${newName}"${opts.parent_chain !== undefined ? ` chain=${opts.parent_chain}` : ''}`);
    return true;
  }
  const { error } = await sb.from('listings').update(patch).eq('id', l.id);
  if (error) { log(`  ⚠ ${l.id.slice(0,8)}: ${error.message.slice(0,100)}`); return false; }
  return true;
}

async function main() {
  appendFileSync(LOG, `\n=== fix-name-mismatches ${new Date().toISOString()} (dry=${DRY}) ===\n`);

  const plan = JSON.parse(readFileSync(resolve(repoRoot, 'scripts/name-mismatch-plan.json'), 'utf8'));

  // 1. Manual overrides first (specific, trusted)
  log(`\n--- MANUAL_OVERRIDES (${MANUAL_OVERRIDES.length}) ---`);
  let manualOk = 0;
  for (const m of MANUAL_OVERRIDES) {
    const { data: l } = await sb.from('listings').select('id,name,parent_chain').eq('id', m.id).single();
    if (!l) { log(`  skip ${m.id.slice(0,8)}: not found`); continue; }
    if (l.name === m.to_name) { log(`  skip ${m.id.slice(0,8)}: already named "${m.to_name}"`); continue; }
    const ok = await applyRename({ id: l.id, db_name: l.name }, m.to_name, { parent_chain: m.parent_chain, reason: m.reason });
    if (ok) manualOk++;
  }
  log(`  manual fixes: ${manualOk}/${MANUAL_OVERRIDES.length}`);

  // 2. Holiday → Circle K
  log(`\n--- HOLIDAY_TO_CIRCLE_K (${plan.HOLIDAY_TO_CIRCLE_K.length}) ---`);
  let holidayOk = 0;
  for (const r of plan.HOLIDAY_TO_CIRCLE_K) {
    // Google displayName is literally "Circle K" for all of these; adopt it
    // and flip parent_chain from "Holiday" to "Circle K" so brand imagery
    // and aggregation logic use the current owner.
    const ok = await applyRename(r, r.google_name, {
      parent_chain: 'Circle K',
      reason: 'Holiday Stationstores was acquired by Circle K; Google now reports Circle K at this place_id.',
    });
    if (ok) holidayOk++;
  }
  log(`  holiday fixes: ${holidayOk}/${plan.HOLIDAY_TO_CIRCLE_K.length}`);

  // 3. Rename to Google (generic db names)
  log(`\n--- RENAME_ADOPT_GOOGLE (${plan.RENAME_ADOPT_GOOGLE.length}) ---`);
  let adoptOk = 0;
  for (const r of plan.RENAME_ADOPT_GOOGLE) {
    const ok = await applyRename(r, r.google_name, {
      reason: 'Our name was generic; adopted Google displayName.',
    });
    if (ok) adoptOk++;
  }
  log(`  adopt-google fixes: ${adoptOk}/${plan.RENAME_ADOPT_GOOGLE.length}`);

  log(`\n=== DONE ===`);
  log(`  Manual overrides:    ${manualOk}`);
  log(`  Holiday → Circle K:  ${holidayOk}`);
  log(`  Adopt Google name:   ${adoptOk}`);
  log(`  Total renames:       ${manualOk + holidayOk + adoptOk}`);
}

main().catch(e => { log(`FATAL ${e.message}`); process.exit(1); });
