#!/usr/bin/env node
/**
 * Recovery pass: examine each listing reverted today for actual touchless
 * evidence in their stored crawl_snapshot. Restore only those that pass an
 * even stricter bar than v3 — must have compound positive phrase AND must
 * have an automatic-bay confirmation signal.
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

const REVERT_SOURCES = ['reverted_apr15_self_serve','reverted_apr15_google_subtype_selfservice','reverted_apr15_v3_strict','reverted_apr15_mixed_facility','reverted_apr15_self_in_name_post_restore'];

// ── Classifier ──
// Compound positive — must match at least ONE
const POSITIVE_COMPOUND = [
  /\btouchless\s+(?:car\s*)?wash\b/i,
  /\btouch\s*-\s*less\s+(?:car\s*)?wash\b/i,
  /\btouch[\s-]free\s+(?:car\s*)?wash\b/i,
  /\btouchfree\s+(?:car\s*)?wash\b/i,
  /\bbrushless\s+(?:car\s*)?wash\b/i,
  /\bno\s*-?\s*touch\s+(?:car\s*)?wash\b/i,
  /\blaser\s*wash\b/i,
  /\blaserwash\b/i,
];

// Automatic/in-bay confirmation — must match at least ONE in addition to compound
const AUTO_CONFIRM = [
  /\bin[\s-]?bay\s+automatic\b/i,
  /\btouchless\s+(?:automatic|auto)\b/i,
  /\bautomatic\s+touchless\b/i,
  /\bautomated\s+(?:touchless|touch[\s-]free|brushless|laser)/i,
  /\bdrive[\s-]?(?:in|through|thru)\s+(?:touchless|touch[\s-]free|brushless|laser|wash)/i,
  /\brollover\s+(?:touchless|touch[\s-]free|brushless|wash)/i,
  /\bpdq\s+(?:laserwash|tandem|access)/i,
  /\bwashworld\s+(?:razor|profile)/i,
  /\bmark\s*vii\s+(?:choice\s*wash|touch[\s-]?free)/i,
  /\bistobal\b/i,
  /\boasis\s+(?:typhoon|eclipse)/i,
  /\bryko\b/i,
  /\blaserwash\s*(?:360|g5|4000)/i,
  /\btouch\s*free\s+automatic\b/i,
  /\bautomatic\s+(?:in[\s-]?bay|touch[\s-]free|touch[\s-]?less)/i,
  /\bgantry\s+wash\b/i,
];

// Negative context — nearby these phrases kills a positive hit
const NEGATIVE_PATTERNS = [
  /\b(?:not|isn[\u2019']?t|aren[\u2019']?t|don[\u2019']?t|doesn[\u2019']?t|wasn[\u2019']?t)\s+(?:a\s+)?(?:touchless|touch[\s-]*free|touchfree|brushless|laser\s*wash)\b/i,
  /\bis\s+not\s+(?:a\s+)?(?:touchless|touch[\s-]*free|brushless)/i,
  /\bwill\s+not\s+(?:be\s+)?(?:touchless|touch[\s-]*free)/i,
];

// Mixed-offer / self-serve dominance — disqualifier
const DISQUALIFYING = [
  /\bsoft[\s-]?touch\s+(?:wash|bay|tunnel|option)\b/i,
  /\bsoft[\s-]?cloth\s+(?:wash|tunnel|bay)\b/i,
  /\b(?:friction|mitter|foam\s+pad)\s+(?:wash|curtain|tunnel)\b/i,
  /\bself[\s-]serv(?:e|ice)\s+(?:bay|wand|wash\s+bay|only)\b/i,
  /\bonly\s+self[\s-]?serv/i,
  /\b(?:\d+|six|\w+)\s+self[\s-]?serv(?:e|ice)\s+bays?\b/i,
  /\bwand\s+(?:wash|bay)\b/i,
  /\bcoin[\s-]?operated\s+(?:wash|bay)\b/i,
];

const NAME_REJECT = /\bself[\s-]?(?:service|serve|svc)\b|\bsoft[\s-]?touch\b(?!\s*automatic)|\bcoin[\s-]?op\b|\bhand[\s-]?wash\b|\btunnel\s+(?:only|wash)\b|\blaser\s+(?:tag|therapy|hair|cosmetic|surgery|clinic|printer)|\bveterinary|\bvet\b|\btrampoline\b/i;
const NAME_KEEP_OVERRIDE = /touchless|touchfree|touch[\s-]free|laser\s*wash|laserwash|brushless|no[\s-]touch/i;
const GOOGLE_SELF_SERVICE = /self[\s-]service\s+car\s+wash/i;

function snapshotText(snap) {
  if (!snap) return '';
  if (typeof snap === 'string') return snap;
  const parts = [];
  if (snap.data?.markdown) parts.push(snap.data.markdown);
  if (snap.data?.text) parts.push(snap.data.text);
  if (snap.markdown) parts.push(snap.markdown);
  return parts.join('\n');
}

function classify(l) {
  // Hard rejects first
  if (GOOGLE_SELF_SERVICE.test(l.google_subtypes || '')) return { restore: false, reason: 'google-self-service' };
  if (NAME_REJECT.test(l.name || '') && !NAME_KEEP_OVERRIDE.test(l.name || '')) return { restore: false, reason: 'name-reject' };

  const text = snapshotText(l.crawl_snapshot);
  if (text.length < 100) return { restore: false, reason: 'snapshot-too-thin' };

  // Disqualifying phrases → no restore
  for (const dq of DISQUALIFYING) {
    if (dq.test(text)) return { restore: false, reason: `disqualifier: ${dq.source.slice(0, 35)}` };
  }

  // Find at least one compound positive NOT in negative context
  let compoundHit = null;
  for (const pos of POSITIVE_COMPOUND) {
    const m = text.match(pos);
    if (!m) continue;
    const start = Math.max(0, m.index - 80);
    const end = Math.min(text.length, m.index + m[0].length + 80);
    const window = text.slice(start, end);
    const hasNeg = NEGATIVE_PATTERNS.some(neg => neg.test(window));
    if (!hasNeg) { compoundHit = m[0]; break; }
  }
  if (!compoundHit) return { restore: false, reason: 'no-valid-compound' };

  // Must have automatic confirmation
  const autoHit = AUTO_CONFIRM.find(a => a.test(text));
  if (!autoHit) return { restore: false, reason: 'no-automatic-confirm' };

  return { restore: true, reason: 'compound + automatic', compound: compoundHit, auto: autoHit.source.slice(0, 40) };
}

// Load reverts
const all = [];
for (let offset = 0; offset < 5000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('id, name, city, state, website, google_subtypes, parent_chain, crawl_snapshot, review_count')
    .in('classification_source', REVERT_SOURCES)
    .range(offset, offset + 999);
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < 1000) break;
}
console.log(`Loaded ${all.length} reverts`);

// Classify — only those WITH crawl_snapshot can be restored in this pass
const haveSnapshot = all.filter(l => l.crawl_snapshot);
console.log(`  With crawl_snapshot: ${haveSnapshot.length}`);

const restores = [];
const rejected = {};
for (const l of haveSnapshot) {
  const r = classify(l);
  if (r.restore) restores.push({ ...l, reason: r.reason, compound: r.compound });
  else rejected[r.reason] = (rejected[r.reason]||0)+1;
}

console.log(`\n=== Recovery classify (among listings with snapshot) ===`);
console.log(`Restore: ${restores.length}`);
console.log(`Rejected breakdown:`);
Object.entries(rejected).sort((a,b)=>b[1]-a[1]).forEach(([r,n]) => console.log(`  ${n.toString().padStart(4)}  ${r}`));

console.log(`\nFirst 40 restoring:`);
for (const r of restores.slice(0, 40)) {
  console.log(`  ${r.name.slice(0, 40).padEnd(40)} ${(r.city||'?').slice(0,15).padEnd(15)} ${r.state}  "${r.compound}"`);
}

// Apply restore
writeFileSync(resolve(repoRoot, 'scripts/discovery-output/recovery-restore.json'), JSON.stringify(restores, null, 2));

let done = 0;
const ids = restores.map(r => r.id);
for (let i = 0; i < ids.length; i += 200) {
  const batch = ids.slice(i, i + 200);
  const { error } = await sb.from('listings').update({
    is_touchless: true, is_approved: true,
    classification_source: 'recovered_apr15_compound_plus_automatic',
    crawl_notes: 'Recovered by strict classifier: compound positive + automatic-bay confirmation in website snapshot, no disqualifiers',
  }).in('id', batch);
  if (!error) done += batch.length;
}
console.log(`\nRestored: ${done}`);

const { count } = await sb.from('listings').select('*',{count:'exact',head:true}).eq('is_touchless', true);
console.log(`Total touchless now: ${count}`);
