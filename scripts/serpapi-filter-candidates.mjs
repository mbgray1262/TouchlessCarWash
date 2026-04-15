#!/usr/bin/env node
/**
 * Filters the 1,273 SerpAPI discovery candidates down to a shortlist worth
 * importing + enriching. Applies:
 *  - Drop non-car-wash businesses (by name/type — Walmart, Harbor Freight, etc.)
 *  - Drop known express-tunnel chains (Mister, Quick Quack, Zips, Take 5,
 *    Tommy's, WhiteWater, Moo Moo, Champion, Whistle, GO Car Wash — these are
 *    definitively tunnel operators, not touchless; they show up in Google
 *    because of loose keyword matching)
 *  - Score remaining by: reviews × (nameTouchless ? 2 : 1) + rating boost
 *  - Output shortlist CSV + rejection CSV for audit
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const outDir = resolve(repoRoot, 'scripts/discovery-output');

// Parse candidates CSV
function parseCsvLine(line) {
  const cells = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { cells.push(cur); cur = ''; }
      else cur += c;
    }
  }
  cells.push(cur);
  return cells;
}
const csv = readFileSync(resolve(outDir, 'serpapi-new-candidates.csv'), 'utf8');
const lines = csv.split('\n').filter(Boolean);
const headers = lines[0].split(',');
const candidates = lines.slice(1).map(l => {
  const cells = parseCsvLine(l);
  const o = {};
  headers.forEach((h, i) => o[h] = cells[i]);
  o.reviews = parseInt(o.reviews || '0', 10) || 0;
  o.rating = parseFloat(o.rating || '0') || 0;
  o.nameIsTouchless = o.nameIsTouchless === 'true';
  return o;
});
console.log(`Loaded ${candidates.length} raw candidates`);

// ── Rejection rules ─────────────────────────────────────────────────────

// Definite non-car-wash businesses
const NON_CARWASH_RE = /\b(walmart|supercenter|harbor freight|home depot|lowe|jerry'?s home improvement|costco|target|kroger|whole foods|gas station|7-eleven|7\/11|chevron|shell|bp\b|mobil|exxon|sunoco|valero|marathon|citgo|phillips 66|arco|pilot|love'?s|mcdonald|burger king|taco bell|subway|starbucks|dunkin|autozone|advance auto|o'reilly|pep boys|napa auto|firestone|midas|jiffy lube|valvoline|discount tire|les schwab|pneum|autopartes|storage|u-haul|uhaul|public storage|pronto|verizon|t-mobile|sprint|at&t)\b/i;

// Known express-tunnel chains (NOT touchless — these run soft-cloth/friction tunnels)
const EXPRESS_TUNNEL_CHAINS = [
  'Mister Car Wash',
  'Quick Quack Car Wash',
  'Zips Car Wash',
  'Take 5 Car Wash',
  "Tommy's Express",
  'WhiteWater Express',
  'Moo Moo Express',
  'Champion Xpress',
  'Champion Express',
  'Whistle Express',
  'GO Car Wash',
  'Clean Express Auto Wash',
  'Flash Car Wash',
  'Mike\'s Carwash',
  'Mr. Clean Car Wash',
  'LUV Car Wash',
  'Club Car Wash',
  'Wiggy Wash',
  'Wiggy Car Wash',
  'Caliber Car Wash',
  'Valet Wash',
  'Spring Green Car Wash',
  'Autobell Car Wash',
  'Super Star Car Wash',
  'Super Suds',
  'Silverstar Car Wash',
  'BlueWave Express',
  'Hoffman Car Wash',
  'Crew Carwash',
  'Fins Car Wash',
  'Metro Express Car Wash',
  'Tidal Wave Auto Spa',          // actually express tunnel despite "Auto Spa" branding
  'Tidal Wave Auto Spa | Car Wash',
  'Rocket Carwash',
  'Rocket Express',
  'Niagara Car Wash',             // tunnel
  'Waterway Carwash',
  'Wash Tub',
  'Fast 5 Xpress Car Wash',
  'Jax Kar Wash',
  'Russell Speeder',
  "Tom's Car Wash",
  'Exxpress',
  'Hello! Deluxe Car Wash',       // express
];
const tunnelChainRe = new RegExp(
  `^\\s*(?:${EXPRESS_TUNNEL_CHAINS.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'i',
);

// Strong touchless signals (bonus scoring)
const STRONG_TOUCHLESS_NAME = /touch\s*(?:less|free)|touchfree|no\s*(?:-|\s)?touch|laser\s*wash|brushless|auto\s*spa(?!\s*[|]\s*car\s*wash)/i;

// Weak touchless signals (moderate bonus)
const WEAK_TOUCHLESS_HINT = /\bwash\b.*(?:touch|laser|spa)|\b(?:spa|laser)\b.*\bwash\b/i;

// ── Apply filters ───────────────────────────────────────────────────────

const rejected = [];
const kept = [];

for (const c of candidates) {
  // Rule 1: obvious non-car-wash
  if (NON_CARWASH_RE.test(c.name)) {
    rejected.push({ ...c, rejectReason: 'non-carwash-business' });
    continue;
  }
  // Rule 2: known express tunnel chain
  if (tunnelChainRe.test(c.name)) {
    rejected.push({ ...c, rejectReason: 'known-tunnel-chain' });
    continue;
  }
  // Rule 3: types field excludes car_wash but includes something unrelated
  const types = (c.types || '').toLowerCase();
  if (types && !types.includes('car_wash') && !types.includes('car wash') && !types.includes('car_detail') && types) {
    // Only reject if types present but not car-wash-related AND name doesn't strongly signal car wash
    if (!/\bcar\s*wash\b|\bauto\s*wash\b|\bwash\b/i.test(c.name)) {
      rejected.push({ ...c, rejectReason: 'types-not-carwash: ' + types.slice(0, 60) });
      continue;
    }
  }
  kept.push(c);
}

// Score kept candidates
for (const c of kept) {
  let score = c.reviews;
  if (STRONG_TOUCHLESS_NAME.test(c.name)) score *= 2.5;
  else if (WEAK_TOUCHLESS_HINT.test(c.name)) score *= 1.3;
  if (c.rating >= 4.5) score *= 1.2;
  c.score = Math.round(score);
  c.confidence = STRONG_TOUCHLESS_NAME.test(c.name) ? 'high' : (WEAK_TOUCHLESS_HINT.test(c.name) ? 'medium' : 'low');
}
kept.sort((a, b) => b.score - a.score);

// ── Write outputs ───────────────────────────────────────────────────────

const csvEscape = v => { if (v == null) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const shortlistCols = ['confidence','score','name','address','lat','lng','rating','reviews','phone','place_id','queriesMatched','firstFoundMetro','thumbnail'];
const shortLines = [shortlistCols.join(',')];
for (const c of kept) shortLines.push(shortlistCols.map(k => csvEscape(c[k])).join(','));
writeFileSync(resolve(outDir, 'serpapi-shortlist.csv'), shortLines.join('\n'));

const rejCols = ['rejectReason','name','reviews','address','types','place_id'];
const rejLines = [rejCols.join(',')];
for (const r of rejected) rejLines.push(rejCols.map(k => csvEscape(r[k])).join(','));
writeFileSync(resolve(outDir, 'serpapi-rejected.csv'), rejLines.join('\n'));

// ── Summary ─────────────────────────────────────────────────────────────

console.log(`\nFilter results:`);
console.log(`  Raw candidates: ${candidates.length}`);
console.log(`  Rejected: ${rejected.length}`);
const rejByReason = {};
for (const r of rejected) {
  const key = r.rejectReason.split(':')[0];
  rejByReason[key] = (rejByReason[key] || 0) + 1;
}
for (const [k, n] of Object.entries(rejByReason)) console.log(`    ${k}: ${n}`);
console.log(`  Kept: ${kept.length}`);
console.log(`    High confidence (strong touchless name): ${kept.filter(c => c.confidence === 'high').length}`);
console.log(`    Medium confidence: ${kept.filter(c => c.confidence === 'medium').length}`);
console.log(`    Low confidence (needs review-mine verification): ${kept.filter(c => c.confidence === 'low').length}`);
console.log(`    With 500+ reviews: ${kept.filter(c => c.reviews >= 500).length}`);
console.log(`    With 100+ reviews: ${kept.filter(c => c.reviews >= 100).length}`);

console.log(`\nTop 25 shortlisted:`);
kept.slice(0, 25).forEach((c, i) => {
  console.log(`${String(i+1).padStart(2)}. [${c.confidence}] ${c.name.slice(0, 42).padEnd(42)} | ${c.reviews.toString().padStart(5)}r · ${c.rating}★ | ${c.address.slice(0, 55)}`);
});

console.log(`\nWrote: ${resolve(outDir, 'serpapi-shortlist.csv')}`);
console.log(`       ${resolve(outDir, 'serpapi-rejected.csv')}`);
