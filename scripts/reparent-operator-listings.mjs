#!/usr/bin/env node
/**
 * Some chains in CHAIN_BRAND_IMAGES are *operators* that run locations under
 * multiple gas-station brands (Max Car Wash runs Shell/Chevron/Marathon/etc.;
 * Power Market is also H&S Energy's Chevron/Shell locations; Extra Mile too;
 * Pinnacle 365 acquired Power Market and many listings still wear Power Market
 * signage). Using one operator brand-image rotation for all of them means a
 * Shell location shows a Chevron photo, which is nonsensical.
 *
 * Fix: re-parent each listing to the gas-station brand visible in its name.
 * The operator info is preserved in the listing name (e.g. "Shell #205
 * (Max Car Wash)") so nothing's lost.
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

// Operator chains where listings need brand-based re-parenting
const OPERATORS = ['Max Car Wash', 'Power Market', 'Extra Mile', 'Pinnacle 365'];

// Gas-station brand detectors. Order matters — more-specific patterns first.
// Only brands that have entries in CHAIN_BRAND_IMAGES (verified in lib/chain-brand-images.ts).
const BRAND_RULES = [
  { brand: 'Shell',         test: (n) => /^Shell\b/i.test(n) },
  { brand: 'Chevron',       test: (n) => /^Chevron\b/i.test(n) },
  { brand: 'Marathon',      test: (n) => /^Marathon\b/i.test(n) },
  { brand: 'Exxon',         test: (n) => /^Exxon\b/i.test(n) },
  { brand: 'Mobil',         test: (n) => /^Mobil\b/i.test(n) },
  { brand: 'BP',            test: (n) => /^BP\b/i.test(n) },
  { brand: 'Sunoco',        test: (n) => /^Sunoco\b/i.test(n) },
  // Power Market re-parent for Pinnacle 365 listings that wear Power Market signage
  { brand: 'Power Market',  test: (n) => /^Power Market\b/i.test(n) || /^POWER MARKET\b/.test(n) },
];

const detectBrand = (name) => {
  for (const r of BRAND_RULES) if (r.test(name)) return r.brand;
  return null;
};

for (const operator of OPERATORS) {
  const { data, error } = await supabase
    .from('listings')
    .select('id, name, city, state, parent_chain')
    .eq('parent_chain', operator);
  if (error) { console.error(`[${operator}] ${error.message}`); continue; }

  const moves = {};
  for (const r of data || []) {
    const detected = detectBrand(r.name);
    if (detected && detected !== operator) {
      (moves[detected] ||= []).push(r);
    }
  }

  if (Object.keys(moves).length === 0) {
    console.log(`[${operator}] no re-parents needed`);
    continue;
  }

  for (const [newChain, rows] of Object.entries(moves)) {
    console.log(`[${operator}] -> [${newChain}]: ${rows.length} listings`);
    rows.slice(0, 3).forEach(r => console.log(`    ${r.name} (${r.city}, ${r.state})`));
    if (rows.length > 3) console.log(`    ...and ${rows.length - 3} more`);

    if (!DRY_RUN) {
      const { error: upErr } = await supabase
        .from('listings')
        .update({ parent_chain: newChain })
        .in('id', rows.map(r => r.id));
      if (upErr) console.error(`  fail: ${upErr.message}`);
    }
  }
}

console.log(DRY_RUN ? '\n--dry-run; no changes written' : '\nDone.');
