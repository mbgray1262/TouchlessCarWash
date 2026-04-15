#!/usr/bin/env node
/**
 * Re-scan snapshots v2 — MUCH stricter than v1 after false-positive review.
 *
 * Rules (ALL must hold):
 *   1. At least one COMPOUND positive phrase: "touchless wash",
 *      "touchless automatic", "touchfree wash", "touch-free wash", "laser wash",
 *      "brushless wash", "no-touch wash", "laserwash"
 *   2. ZERO negative signals in the snapshot:
 *      - "not touchless", "isn't touchless" (handles both ' and ’ apostrophes)
 *      - "soft touch", "soft cloth", "mitter", "foam pad"  (indicates friction
 *        wash offered at same location — ambiguous at best)
 *      - "friction wash"
 *   3. Listing name must look like a car wash (contains wash|auto|car|laser|
 *      cleaning|shine|spa|suds|express) — rejects trampoline parks, vet clinics
 *      that somehow ended up in the DB
 *
 * Skips listings already is_touchless=true. Only targets null and false.
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

// ── Strict positive: compound phrase required ──
const POSITIVE_COMPOUNDS = [
  /\btouchless\s+(?:wash|car\s*wash|auto(?:matic)?|bay)\b/i,
  /\btouch\s*-\s*less\s+(?:wash|car\s*wash|auto(?:matic)?|bay)\b/i,
  /\btouch\s*free\s+(?:wash|car\s*wash|auto(?:matic)?|bay)\b/i,
  /\btouchfree\s+(?:wash|car\s*wash|auto(?:matic)?|bay)\b/i,
  /\bbrushless\s+(?:wash|car\s*wash|auto(?:matic)?|bay|clean)\b/i,
  /\bno\s*-?\s*touch\s+(?:wash|car\s*wash|auto(?:matic)?|bay)\b/i,
  /\blaser\s*wash\b/i,
  /\blaserwash\b/i,
  /\bpdq\s+laserwash\b/i,
  /\bonly\s+(?:water|high[\s-]pressure)\s+(?:touches|contacts)\b/i,
  /\b(?:no|zero)\s+(?:brushes|brush|cloth|friction)\b/i,
];

// ── Negative signals: any of these means SKIP the listing ──
// Apostrophe class: [\u2019'] covers curly and straight
const NEGATIVE_PATTERNS = [
  /\b(?:not|isn[\u2019']?t|aren[\u2019']?t|don[\u2019']?t|doesn[\u2019']?t|wasn[\u2019']?t|isn[\u2019']t)\s+(?:a\s+)?(?:touchless|touch[\s-]*free|touchfree|brushless|laser\s*wash)\b/i,
  /\bis\s+not\s+(?:a\s+)?(?:touchless|touch[\s-]*free|brushless)/i,
  /\bno\s+(?:touchless|touch[\s-]*free|brushless|laser)\s+(?:wash|bay|option)\b/i,
  // Co-offering friction wash → ambiguous
  /\bsoft[\s-]?touch\s+(?:wash|bay|option|tunnel)\b/i,
  /\bsoft[\s-]?cloth\s+(?:wash|tunnel|bay)\b/i,
  /\b(?:friction|mitter|foam\s+pad)\s+(?:wash|curtain|tunnel)\b/i,
  /\bsoft[\s-]?touch\s+(?:&|and)\s+touchless\b/i,
  /\btouchless\s+(?:&|and)\s+soft[\s-]?touch\b/i,
  // Non-car-wash laser contexts
  /\blaser\s+(?:tag|therapy|hair|cosmetic|surgery|treatment|printer|pointer|clinic|dermatology|aesthetic)\b/i,
];

// ── Name must look like a car wash ──
const CARWASH_NAME_RE = /\b(?:wash|auto\s+spa|auto\s+wash|car\s+wash|carwash|detail|laser|suds|shine|lube|express|automatic|station|oil|filling|gas|fuel|service\s+station|convenience|market|stop|mart)\b/i;
// Explicit name rejects
const REJECT_NAME = /trampoline|veterinary|\bvet\b|dermatology|cosmetic|aesthetic|surgery|hair\s+removal|laser\s+tag|urban\s+air|hospital|clinic|printer|school|church|hotel/i;

function snapshotText(snap) {
  if (!snap) return '';
  if (typeof snap === 'string') return snap;
  const parts = [];
  if (snap.data?.markdown) parts.push(snap.data.markdown);
  if (snap.data?.text) parts.push(snap.data.text);
  if (snap.markdown) parts.push(snap.markdown);
  if (snap.text) parts.push(snap.text);
  return parts.join('\n');
}

function classify(name, text) {
  if (!text || text.length < 50) return { touchless: false, reason: 'empty' };
  if (REJECT_NAME.test(name || '')) return { touchless: false, reason: 'rejected-name' };
  if (!CARWASH_NAME_RE.test(name || '')) return { touchless: false, reason: 'name-not-carwash-like' };

  // Negative trumps positive
  for (const neg of NEGATIVE_PATTERNS) {
    if (neg.test(text)) return { touchless: false, reason: `negative: ${neg.source.slice(0, 40)}` };
  }

  // Require at least one compound positive
  const hits = [];
  for (const pos of POSITIVE_COMPOUNDS) {
    const m = text.match(pos);
    if (m) hits.push(m[0]);
  }
  if (hits.length === 0) return { touchless: false, reason: 'no-compound-positive' };
  return { touchless: true, hits };
}

// ── Load candidates ──
console.log('Loading candidates...');
const candidates = [];
for (let offset = 0; offset < 70000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('id, name, city, state, is_touchless, crawl_snapshot')
    .or('is_touchless.is.null,is_touchless.eq.false')
    .not('crawl_snapshot', 'is', null)
    .range(offset, offset + 999);
  if (!data || data.length === 0) break;
  candidates.push(...data);
  if (data.length < 1000) break;
}
console.log(`  ${candidates.length} candidates to scan`);

let positive = 0, checked = 0;
const rejectReasons = {};
const promoteList = [];
for (const l of candidates) {
  checked++;
  const text = snapshotText(l.crawl_snapshot);
  const result = classify(l.name, text);
  if (result.touchless) {
    positive++;
    promoteList.push({ id: l.id, name: l.name, city: l.city, state: l.state, hits: result.hits });
  } else {
    const reasonKey = result.reason.split(':')[0];
    rejectReasons[reasonKey] = (rejectReasons[reasonKey] || 0) + 1;
  }
  if (checked % 2000 === 0) process.stdout.write(`\r  ${checked}/${candidates.length} · ${positive} positive`);
}
process.stdout.write('\n');

console.log(`\nScan complete:`);
console.log(`  Scanned:  ${checked}`);
console.log(`  Positive: ${positive}`);
console.log(`  Reject reasons:`, rejectReasons);

writeFileSync(resolve(repoRoot, 'scripts/discovery-output/rescan-v2-audit.json'), JSON.stringify(promoteList, null, 2));

console.log(`\nFirst 30 promotions (spot-check BEFORE mass update):`);
for (const p of promoteList.slice(0, 30)) {
  console.log(`  ${p.name.slice(0, 45).padEnd(45)} ${(p.city||'?').slice(0,18).padEnd(18)} ${p.state}  hits: ${p.hits.slice(0,2).join(' | ')}`);
}

// DO NOT auto-promote — wait for manual review. Just write the audit.
console.log(`\nAudit written to scripts/discovery-output/rescan-v2-audit.json`);
console.log(`Run scripts/promote-rescan-v2.mjs to apply after review.`);
