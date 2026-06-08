/**
 * Generate supabase/functions/compute-rankings/metros.ts from the canonical
 * site metro list (lib/metro-areas.ts) so the ranking job and the website
 * always cover the SAME metros. Past bug: the edge function kept its own
 * hardcoded 85-metro copy that drifted from the site's 252, so a full
 * recompute silently dropped trophies (and live badges) for ~167 metros.
 *
 * Run: node scripts/gen-compute-rankings-metros.mjs
 * Enforced in CI-style by scripts/check-compute-rankings-metros.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'lib/metro-areas.ts';
const OUT = 'supabase/functions/compute-rankings/metros.ts';

const text = readFileSync(SRC, 'utf8');
const start = text.indexOf('export const METRO_AREAS');
if (start === -1) throw new Error(`Could not find METRO_AREAS in ${SRC}`);
// Slice from the array opening bracket to its matching close `];`.
const arrOpen = text.indexOf('[', start);
const arrClose = text.indexOf('\n];', arrOpen);
if (arrOpen === -1 || arrClose === -1) throw new Error('Could not bound the METRO_AREAS array');
const body = text.slice(arrOpen + 1, arrClose);

const grab = (obj, re) => { const m = obj.match(re); return m ? m[1] : null; };
const metros = [];
for (const line of body.split('\n')) {
  if (!line.includes('slug:')) continue; // skip comments / blanks
  const name = grab(line, /name:\s*'([^']*)'/);
  const displayName = grab(line, /displayName:\s*'([^']*)'/);
  const slug = grab(line, /slug:\s*'([^']*)'/);
  const lat = grab(line, /lat:\s*(-?[\d.]+)/);
  const lng = grab(line, /lng:\s*(-?[\d.]+)/);
  const radiusMiles = grab(line, /radiusMiles:\s*(\d+)/);
  if (!name || !displayName || !slug || lat == null || lng == null || radiusMiles == null) {
    throw new Error(`Failed to parse metro line: ${line.trim()}`);
  }
  metros.push({ name, displayName, slug, lat: Number(lat), lng: Number(lng), radiusMiles: Number(radiusMiles) });
}

// Guard against silent slug collisions (would corrupt metro clusters).
const slugs = new Set();
for (const m of metros) {
  if (slugs.has(m.slug)) throw new Error(`Duplicate metro slug: ${m.slug}`);
  slugs.add(m.slug);
}

const rows = metros
  .map((m) => `  { name: ${JSON.stringify(m.name)}, displayName: ${JSON.stringify(m.displayName)}, slug: ${JSON.stringify(m.slug)}, lat: ${m.lat}, lng: ${m.lng}, radiusMiles: ${m.radiusMiles} },`)
  .join('\n');

const out = `// AUTO-GENERATED from lib/metro-areas.ts — DO NOT EDIT BY HAND.
// Regenerate: node scripts/gen-compute-rankings-metros.mjs
// Single source of truth for the metro list is lib/metro-areas.ts so the
// compute-rankings job and the website always cover the same metros.
export type Metro = {
  name: string;
  displayName: string;
  slug: string;
  lat: number;
  lng: number;
  radiusMiles: number;
};

export const METRO_AREAS: Metro[] = [
${rows}
];
`;

writeFileSync(OUT, out);
console.log(`Wrote ${metros.length} metros to ${OUT}`);
