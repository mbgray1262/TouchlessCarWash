/**
 * Fails (exit 1) if supabase/functions/compute-rankings/metros.ts is out of
 * sync with lib/metro-areas.ts. Run after editing the metro list so the
 * ranking job and the website can never silently drift apart again.
 *
 * Run: node scripts/check-compute-rankings-metros.mjs
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const OUT = 'supabase/functions/compute-rankings/metros.ts';
const before = readFileSync(OUT, 'utf8');
execSync('node scripts/gen-compute-rankings-metros.mjs', { stdio: 'pipe' });
const after = readFileSync(OUT, 'utf8');

if (before !== after) {
  console.error(
    '✗ compute-rankings/metros.ts is stale vs lib/metro-areas.ts.\n' +
    '  It has been regenerated — commit the change.',
  );
  process.exit(1);
}
console.log('✓ compute-rankings metro list is in sync with lib/metro-areas.ts');
