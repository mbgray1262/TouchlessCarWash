#!/usr/bin/env node
/**
 * Backfill parent_chain for approved listings whose `name` exactly matches a
 * chain we just registered in CHAIN_BRAND_IMAGES but currently has
 * parent_chain=NULL. Without parent_chain set, the brand-image fallback never
 * kicks in for that listing.
 *
 * Conservative: only fills NULLs, never overwrites an existing chain (so
 * Chevron-branded "Extra Mile" / "Power Market" sub-brand listings stay put).
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');

const env = Object.fromEntries(
  fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l => {
    const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CHAINS = [
  'Shell', 'Chevron', 'Mobil', 'Precision Wash', 'Sunoco',
  'Coastal Carolina Car Wash', 'Hoffman Car Wash', 'Exxon',
  'Spritz Car Wash', '76', 'Mr Sparkle Car Wash', 'Marathon',
];

for (const chain of CHAINS) {
  // Paginated count of approved listings with this exact name and null parent_chain
  let ids = [];
  let lastId = '00000000-0000-0000-0000-000000000000';
  while (true) {
    const { data, error } = await supabase
      .from('listings')
      .select('id')
      .eq('is_approved', true)
      .eq('name', chain)
      .is('parent_chain', null)
      .gt('id', lastId)
      .order('id')
      .limit(1000);
    if (error) { console.error(`[${chain}] ${error.message}`); break; }
    if (!data || !data.length) break;
    ids = ids.concat(data.map(r => r.id));
    lastId = data[data.length - 1].id;
    if (data.length < 1000) break;
  }
  if (ids.length === 0) {
    console.log(`[${chain}] nothing to backfill`);
    continue;
  }
  console.log(`[${chain}] backfilling parent_chain on ${ids.length} approved listings`);
  if (!DRY_RUN) {
    // Update via the same predicate (no .in() of huge id lists)
    const { error: upErr, count } = await supabase
      .from('listings')
      .update({ parent_chain: chain }, { count: 'exact' })
      .eq('is_approved', true)
      .eq('name', chain)
      .is('parent_chain', null);
    if (upErr) console.error(`  fail: ${upErr.message}`);
    else console.log(`   ...wrote ${count}`);
  }
}

console.log(DRY_RUN ? '\n--dry-run; no changes written' : '\nDone.');
