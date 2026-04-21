#!/usr/bin/env node
/**
 * Categorize the audit-name-mismatches-report.json entries so we have a
 * clear picture of what needs renaming vs deleting vs keeping.
 *
 * Categories:
 *   HOLIDAY_TO_CIRCLE_K — "Holiday Stationstores" / "Holiday" rebrand
 *   RENAME_ADOPT_GOOGLE — name genuinely changed, adopt Google's displayName
 *   TERRIBLES_WEIRD     — "Terrible's" generic addresses / gas station shell
 *   FALSE_POSITIVE      — mismatch is cosmetic (suffix, location qualifier)
 *   MANUAL              — needs human judgement
 */
import { readFileSync, writeFileSync } from 'node:fs';

const report = JSON.parse(readFileSync('scripts/audit-name-mismatches-report.json', 'utf8'));
const rows = report.name_mismatches;

function normalize(s) {
  return (s||'').toLowerCase()
    .replace(/&/g,'and')
    .replace(/['’`"]/g,'')
    .replace(/\b(car ?wash|auto ?wash|wash|llc|inc|co)\b/g,'')
    .replace(/[^a-z0-9]+/g,' ')
    .trim();
}

const cat = { HOLIDAY_TO_CIRCLE_K: [], TERRIBLES_WEIRD: [], FALSE_POSITIVE: [], RENAME_ADOPT_GOOGLE: [], MANUAL: [] };

for (const r of rows) {
  const dbN = normalize(r.db_name);
  const gN = normalize(r.google_name);

  // Holiday → Circle K rebrand
  if (/\bholiday\b/.test(dbN) && /circle\s*k/.test(gN)) { cat.HOLIDAY_TO_CIRCLE_K.push(r); continue; }
  // Terrible's generic addresses
  if (/\bterrible/.test(dbN)) { cat.TERRIBLES_WEIRD.push(r); continue; }
  // False positives: Google just added "- City" or "Touchless Automatic" qualifier
  //   (db_name appears inside google_name as substring, or vice versa)
  const gContainsDb = gN.length > 0 && dbN.length > 0 && gN.includes(dbN);
  const dbContainsG = gN.length > 0 && dbN.length > 0 && dbN.includes(gN);
  if (gContainsDb || dbContainsG) { cat.FALSE_POSITIVE.push(r); continue; }
  // Similarity still ≥ 0.3 and share any token → usually safe adopt
  // (but we'll default to adopt Google for anything ≥ 0 token overlap if the
  // *existing* name looks generic like "Touchless Car Wash", "Car Wash")
  if (/^(touchless|self serve|car wash|auto wash|express|quick|self service)+$/.test(dbN) && gN.length > 3) {
    cat.RENAME_ADOPT_GOOGLE.push(r);
    continue;
  }
  cat.MANUAL.push(r);
}

console.log('\n=== Name-mismatch breakdown (164 total) ===\n');
for (const [k, v] of Object.entries(cat)) {
  console.log(`${k.padEnd(22)} ${String(v.length).padStart(4)} listings`);
}

console.log('\n--- HOLIDAY_TO_CIRCLE_K (first 5) ---');
for (const r of cat.HOLIDAY_TO_CIRCLE_K.slice(0, 5)) console.log(`  ${r.db_name} → ${r.google_name}  (${r.city}, ${r.state})`);
console.log(`\n--- TERRIBLES_WEIRD (first 5) ---`);
for (const r of cat.TERRIBLES_WEIRD.slice(0, 5)) console.log(`  ${r.db_name} → ${r.google_name}  (${r.city}, ${r.state})`);
console.log(`\n--- RENAME_ADOPT_GOOGLE (first 5) ---`);
for (const r of cat.RENAME_ADOPT_GOOGLE.slice(0, 5)) console.log(`  ${r.db_name} → ${r.google_name}  (${r.city}, ${r.state})`);
console.log(`\n--- MANUAL (first 10, worst-similarity) ---`);
for (const r of cat.MANUAL.slice(0, 10)) console.log(`  [${r.similarity}] ${r.db_name} → ${r.google_name}  (${r.city}, ${r.state})`);

writeFileSync('scripts/name-mismatch-plan.json', JSON.stringify(cat, null, 2));
console.log('\nWritten: scripts/name-mismatch-plan.json');
