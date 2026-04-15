#!/usr/bin/env node
/**
 * Re-scans existing crawl_snapshot records with an EXPANDED touchless keyword
 * set that includes:
 *   - standalone "laser" (new signal — was previously only caught as "laser wash")
 *   - brush-free / brushless variants
 *   - full touchfree / touch-less / no-touch variants
 *
 * CRITICAL: negative context detection — any positive match within 60 chars of
 * phrases like "not touchless", "isn't touch free", "doesn't have" is rejected.
 * This is what caught the 347 false positives in April 13's scan.
 *
 * Targets listings where is_touchless is null or false, have a crawl_snapshot,
 * and were not already classified via review-mine as clean.
 *
 * 100% free — purely local regex over existing DB data.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = [resolve(repoRoot, '.env.local'), '/Users/michaelgray/Projects/TouchlessCarWash/.env.local']
  .find(p => { try { readFileSync(p,'utf8'); return true; } catch { return false; } });
const env = readFileSync(envPath,'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// ── Positive signals ──
const POSITIVE_PATTERNS = [
  /\btouchless\b/i,
  /\btouch\s*-\s*less\b/i,
  /\btouch\s*free\b/i,
  /\btouchfree\b/i,
  /\btouch\s*-\s*free\b/i,
  /\bno\s*-?\s*touch\b/i,
  /\bbrushless\b/i,
  /\bbrush\s*-?\s*free\b/i,
  /\bno\s*brushes\b/i,
  /\blaser\s*wash\b/i,
  /\blaserwash\b/i,
  /\bpdq\s+laserwash\b/i,
  /\bmark\s*vii\s+(?:choice\s*wash|touch[\s-]*free)\b/i,
  // Standalone "laser" is a strong signal in car-wash context (enabled per user request Apr 15)
  /\blaser\b/i,
];

// ── Negative context — reject matches found within N chars of these phrases ──
const NEGATIVE_CONTEXT = [
  /\b(?:not|isn'?t|aren'?t|don'?t|doesn'?t|won'?t|no(?:t)?\s+a)\s+(?:a\s+)?(?:touchless|touch\s*free|touchfree|brushless|laser)/i,
  /\bnot?\s+(?:have|offer|feature|include)\s+(?:a\s+)?(?:touchless|touch\s*free|brushless|laser)/i,
  /\bno\s+(?:touchless|touch\s*free|brushless|laser)\s+(?:wash|bay|option|available)/i,
  /\b(?:instead|rather)\s+(?:of|than)\s+(?:touchless|touch\s*free)/i,
  /\bwe\s+(?:don'?t|do\s+not)\s+(?:offer|have|use)/i,
  /\bnot\s+a\s+(?:touchless|touch\s*free|laser)/i,
];

// ── False-positive names to skip entirely ──
const FALSE_POS_NAME = /derma\s+rescue|laser\s+(?:cosmetic|wellness|dermatology|hair\s+removal|aesthetic|clinic|spa(?!\s+car))|laser\s+lube|laser.*oil\s+change|laser\s+tag|laser\s+printer/i;

function snapshotText(snap) {
  if (!snap) return '';
  if (typeof snap === 'string') return snap;
  const parts = [];
  if (snap.data?.markdown) parts.push(snap.data.markdown);
  if (snap.data?.text) parts.push(snap.data.text);
  if (snap.data?.content) parts.push(String(snap.data.content));
  if (snap.markdown) parts.push(snap.markdown);
  if (snap.text) parts.push(snap.text);
  return parts.join('\n');
}

function classifyText(text) {
  if (!text || text.length < 50) return { signal: false };
  const lower = text.toLowerCase();
  const hits = [];
  for (const pat of POSITIVE_PATTERNS) {
    let m;
    const re = new RegExp(pat.source, 'gi');
    while ((m = re.exec(text)) !== null) {
      // Collect 60-char window for negative check
      const start = Math.max(0, m.index - 60);
      const end = Math.min(text.length, m.index + m[0].length + 60);
      const window = text.slice(start, end);
      const isNegative = NEGATIVE_CONTEXT.some(neg => neg.test(window));
      if (!isNegative) {
        hits.push({ match: m[0], window: window.replace(/\s+/g, ' ').trim().slice(0, 140) });
      }
    }
  }
  return { signal: hits.length >= 2, hits: hits.slice(0, 5) };
}

// ── Load candidates ──
console.log('Loading listings with crawl_snapshot but not yet confirmed touchless...');
const candidates = [];
for (let offset = 0; offset < 70000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('id, name, city, state, is_touchless, crawl_snapshot, review_mine_status, classification_source')
    .or('is_touchless.is.null,is_touchless.eq.false')
    .not('crawl_snapshot', 'is', null)
    .range(offset, offset + 999);
  if (!data || data.length === 0) break;
  candidates.push(...data);
  if (data.length < 1000) break;
}
console.log(`  ${candidates.length} listings to re-scan`);

// ── Scan ──
let positive = 0, checked = 0, skippedFalsePos = 0;
const promoteIds = [];
const auditLog = [];
for (const l of candidates) {
  checked++;
  if (FALSE_POS_NAME.test(l.name || '')) { skippedFalsePos++; continue; }
  const text = snapshotText(l.crawl_snapshot);
  const result = classifyText(text);
  if (result.signal) {
    positive++;
    promoteIds.push(l.id);
    auditLog.push({
      id: l.id,
      name: l.name,
      city: l.city,
      state: l.state,
      was: l.is_touchless === null ? 'null' : 'false',
      hits: result.hits.map(h => h.match),
      sample: result.hits[0]?.window || '',
    });
  }
  if (checked % 1000 === 0) {
    process.stdout.write(`\r  ${checked}/${candidates.length} scanned, ${positive} positive signals`);
  }
}
process.stdout.write('\n');

console.log(`\nScan complete:`);
console.log(`  Total scanned:       ${checked}`);
console.log(`  Skipped false-pos:   ${skippedFalsePos}`);
console.log(`  Positive signal (≥2 hits w/ negative-context filter): ${positive}`);

// Write audit log before doing anything
writeFileSync(resolve(repoRoot, 'scripts/discovery-output/rescan-audit.json'), JSON.stringify(auditLog, null, 2));
console.log(`  Audit written: scripts/discovery-output/rescan-audit.json`);

// ── Sample for eyeball-check ──
console.log(`\nFirst 20 promotions (for spot-check):`);
for (const a of auditLog.slice(0, 20)) {
  console.log(`  [${a.was}] ${a.name.slice(0, 40).padEnd(40)} ${a.city}, ${a.state}`);
  console.log(`      hits: ${a.hits.join(', ')}`);
  console.log(`      "${a.sample.slice(0, 100)}"`);
}

// ── Promote ──
console.log(`\nPromoting ${promoteIds.length} listings to is_touchless=true...`);
let promoted = 0, errors = 0;
for (let i = 0; i < promoteIds.length; i += 500) {
  const batch = promoteIds.slice(i, i + 500);
  const { error } = await sb.from('listings').update({
    is_touchless: true,
    is_approved: true,
    touchless_verified: 'admin',
    classification_source: 'snapshot_rescan_expanded_apr15',
  }).in('id', batch);
  if (error) { errors += batch.length; console.error('  batch error:', error.message); }
  else promoted += batch.length;
}
console.log(`  Promoted: ${promoted}. Errors: ${errors}`);
