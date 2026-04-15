#!/usr/bin/env node
/**
 * v3 STRICT audit of all current is_touchless=true listings.
 *
 * A listing passes ONLY if it has clear evidence of being AUTOMATIC touchless
 * (not self-serve wand wash). At least ONE of these must hold:
 *
 *   A. parent_chain is in VERIFIED_ALL_AUTO_CHAINS (every location in our DB
 *      came from an official Touch Free list, chain runs automatic touchless
 *      equipment at all sites)
 *   B. Google explicitly classifies as "Automatic car wash" in subtypes
 *   C. NAME contains compound touchless phrase: "touchless car wash", "touch
 *      free car wash", "laser wash", "laserwash", "brushless car wash", etc.
 *   D. equipment_brand is a known automatic touchless manufacturer (PDQ,
 *      Washworld, Mark VII ChoiceWash, Istobal, Oasis, Ryko)
 *   E. touchless_wash_types array contains "laser" or "touchless"
 *   F. crawl_snapshot markdown contains compound positive ("touchless wash",
 *      "in-bay automatic touchless", etc.) AND no self-serve/soft-touch/
 *      mixed-offer negative signals
 *   G. classification_source starts with 'chain_' or 'restored_apr15_chain'
 *      (authoritative chain imports)
 *
 * AND the listing must NOT:
 *   - have "Self service car wash" in google_subtypes
 *   - have NAME containing "self service", "self serve", "soft touch" (unless
 *     name also has touchless/laser compound)
 *
 * Every failing listing → reverted to is_touchless=false with
 * classification_source='reverted_apr15_v3_strict'.
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

// Chains where EVERY location in our DB was imported from an authoritative
// all-touchless source (Touch Free filter / touchless drive-through listing).
const VERIFIED_ALL_AUTO_CHAINS = new Set([
  'Sheetz',                       // All PDQ LaserWash
  'Holiday Stationstores',        // Imported only Touch Free entries
  'Kwik Trip',                    // Imported only Touch Free entries
  'Power Market',                 // H&S Energy touchless drive-through list
  'Extra Mile',                   // H&S Energy touchless drive-through list
  'Pinnacle 365',                 // H&S Energy touchless drive-through list
  'Terrible\'s',                  // Terrible's Touch Free filter
  'Hy-Vee',                       // All touchless per chain (some mixed)
  'BellStores',                   // Touch Free tunnel
  'Kelley\'s Market',             // All PDQ
  'Family Express',               // Imported chain-verified
  'Executive Laser Wash',         // Name says it all
  'Prestige Car Wash',            // All Prestige locations are touchless automatic
  'Precision Wash',               // All PDQ LaserWash G5
  'ScrubaDub',                    // Touchless (laser) bay locations only
  'Caribbean Auto Spa',           // Verified touchless
  'Jurassic Car Wash',            // All touchless per chain
  'Foam & Wash',                  // All touchless bays
  'Mr. Magic Car Wash',           // All touchless
  'Blue Tide Car Wash',           // All touchless
  'Dirtbuster Car Wash',          // All touchless
  'Wooly Wash',                   // All touchless
  'Salty Dog Car Wash',           // All touchless
  'Rocky Mountain Car Wash',      // All touchless
  'Auto Spa Speedy Wash',         // All touchless
  'Power Wash USA',               // All touchless
  'IQ Car Wash',                  // All touchless
  'Royal Rinse Car Wash',         // All touchless
  "Splash'n Shine",               // All touchless
  'Flagstop Car Wash',            // Only North Chesterfield is touchless — REMOVE
  // Mixed chains excluded — need per-location verification:
  //   Drive & Shine (some self-serve)
  //   Super Wash (some self-serve)
  //   Brown Bear (some self-serve)
  //   Autowash (some self-serve)
  //   Delta Sonic (only touchless-bay sites)
  //   BP (mixed operators)
  //   Splash Car Wash (mixed)
]);
// Actually remove Flagstop from the auto-trust list since only 1 location is touchless
VERIFIED_ALL_AUTO_CHAINS.delete('Flagstop Car Wash');

// Strict compound positive phrases
const NAME_COMPOUND = /\btouchless\s+(?:car\s*)?wash\b|\btouch\s*free\s+(?:car\s*)?wash\b|\btouchfree\s+(?:car\s*)?wash\b|\blaser\s*wash\b|\blaserwash\b|\bbrushless\s+(?:car\s*)?wash\b|\bno[\s-]touch\s+(?:car\s*)?wash\b|\btouch[\s-]less\s+(?:car\s*)?wash\b/i;
const NAME_SHORT_SIGNAL = /\btouchless\b|\btouchfree\b|\btouch[\s-]free\b|\blaser\b|\bbrushless\b/i;
const NAME_EXPLICIT_REJECT = /\bself[\s-]?(?:service|serve|svc)\b|\bsoft[\s-]?touch\b(?!\s*automatic)|\bcoin[\s-]?op\b|\bhand[\s-]wash/i;
const NAME_COUNTER_SIGNAL = /touchless|touch[\s-]?free|laser|brushless|no[\s-]touch/i;

const GOOGLE_SELF_SERVICE = /self[\s-]service\s+car\s+wash|self[\s-]serve\s+car\s+wash/i;
const GOOGLE_AUTOMATIC = /\bautomatic\s+car\s+wash\b|automated\s+car\s+wash/i;

const EQUIP_AUTOMATIC = /^(pdq|washworld|mark\s*vii|mark\s*7|istobal|oasis|ryko|d\s*&\s*s|washtec)/i;

// Compound positive in crawl snapshot markdown
const SNAPSHOT_POSITIVE = [
  /\btouchless\s+(?:wash|car\s*wash|auto(?:matic)?|bay)\b/i,
  /\btouch[\s-]free\s+(?:wash|car\s*wash|auto(?:matic)?|bay)\b/i,
  /\btouchfree\s+(?:wash|car\s*wash|auto(?:matic)?|bay)\b/i,
  /\bbrushless\s+(?:wash|car\s*wash|auto(?:matic)?|bay|clean)\b/i,
  /\bno\s*-?\s*touch\s+(?:wash|car\s*wash|auto(?:matic)?|bay)\b/i,
  /\blaser\s*wash\b/i,
  /\blaserwash\b/i,
  /\bpdq\s+laserwash\b/i,
  /\bin[\s-]?bay\s+automatic\b/i,
];
const SNAPSHOT_NEGATIVE = [
  /\b(?:not|isn[\u2019']?t|aren[\u2019']?t|don[\u2019']?t|doesn[\u2019']?t)\s+(?:a\s+)?(?:touchless|touch[\s-]*free|touchfree|brushless|laser\s*wash)\b/i,
  /\bis\s+not\s+(?:a\s+)?(?:touchless|touch[\s-]*free|brushless)/i,
  /\bsoft[\s-]?touch\s+(?:wash|bay|tunnel)\b/i,
  /\bsoft[\s-]?cloth\s+(?:wash|tunnel)\b/i,
  /\b(?:friction|mitter)\s+(?:wash|curtain|tunnel)\b/i,
];
const SNAPSHOT_MIXED_OFFER = /\bsoft[\s-]?touch\s+(?:&|and|or|\+)\s+touchless\b|\btouchless\s+(?:&|and|or|\+)\s+soft[\s-]?touch\b|\btouchless\s+(?:or|\+)\s+tunnel\b/i;

function snapshotText(snap) {
  if (!snap) return '';
  if (typeof snap === 'string') return snap;
  const parts = [];
  if (snap.data?.markdown) parts.push(snap.data.markdown);
  if (snap.data?.text) parts.push(snap.data.text);
  if (snap.markdown) parts.push(snap.markdown);
  return parts.join('\n');
}

function evaluate(l) {
  // Hard-rejects first
  if (GOOGLE_SELF_SERVICE.test(l.google_subtypes || '')) return { pass: false, reason: 'google-subtype-self-service' };
  if (NAME_EXPLICIT_REJECT.test(l.name || '') && !NAME_COUNTER_SIGNAL.test(l.name || '')) return { pass: false, reason: 'name-explicit-self-serve' };

  // Pass criteria — any ONE is enough
  if (l.parent_chain && VERIFIED_ALL_AUTO_CHAINS.has(l.parent_chain)) return { pass: true, reason: 'verified-all-auto-chain' };
  if (GOOGLE_AUTOMATIC.test(l.google_subtypes || '')) return { pass: true, reason: 'google-subtype-automatic' };
  if (NAME_COMPOUND.test(l.name || '')) return { pass: true, reason: 'name-compound' };
  if (l.equipment_brand && EQUIP_AUTOMATIC.test(l.equipment_brand)) return { pass: true, reason: 'equipment-brand' };
  if (Array.isArray(l.touchless_wash_types) && l.touchless_wash_types.some(t => /laser|touchless/i.test(t))) return { pass: true, reason: 'touchless_wash_types' };

  // Classification source from authoritative imports
  const src = l.classification_source || '';
  if (/^chain_|^restored_apr15_chain/.test(src)) return { pass: true, reason: 'authoritative-import' };
  if (src === 'osm_overpass_apr15' && NAME_COMPOUND.test(l.name || '')) return { pass: true, reason: 'osm-with-name' };

  // Snapshot evidence — must have positive, no negative, no mixed-offer
  const md = snapshotText(l.crawl_snapshot);
  if (md.length > 50) {
    const hasPositive = SNAPSHOT_POSITIVE.some(p => p.test(md));
    const hasNegative = SNAPSHOT_NEGATIVE.some(n => n.test(md));
    const hasMixed = SNAPSHOT_MIXED_OFFER.test(md);
    // Also check for dominant self-serve context
    const hasSelfServe = /\bself[\s-]serv(?:e|ice)\s+(?:bay|wash|car\s*wash)\b|\bwand\s+(?:wash|bay)\b|\bcoin[\s-]?operated\b/i.test(md);
    if (hasPositive && !hasNegative && !hasMixed && !hasSelfServe) return { pass: true, reason: 'snapshot-evidence' };
    if (hasPositive && hasSelfServe) return { pass: false, reason: 'snapshot-mixed-self-serve' };
    if (hasNegative) return { pass: false, reason: 'snapshot-negative' };
  }

  // Only a NAME_SHORT_SIGNAL and no other evidence — ambiguous, reject
  if (NAME_SHORT_SIGNAL.test(l.name || '')) return { pass: false, reason: 'name-short-only-insufficient' };

  return { pass: false, reason: 'no-evidence' };
}

// Load all touchless
const all = [];
for (let offset = 0; offset < 10000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('id, name, city, state, parent_chain, google_subtypes, google_category, equipment_brand, touchless_wash_types, crawl_snapshot, classification_source, touchless_verified')
    .eq('is_touchless', true).range(offset, offset + 999);
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < 1000) break;
}
console.log(`Auditing ${all.length} is_touchless=true listings`);

const pass = [], fail = [];
const reasonCounts = {};
for (const l of all) {
  const r = evaluate(l);
  reasonCounts[r.reason] = (reasonCounts[r.reason]||0)+1;
  if (r.pass) pass.push({ ...l, passReason: r.reason });
  else fail.push({ ...l, failReason: r.reason });
}

console.log(`\n=== Results ===`);
console.log(`  PASS: ${pass.length}`);
console.log(`  FAIL: ${fail.length}`);
console.log(`\nReasons breakdown:`);
Object.entries(reasonCounts).sort((a,b)=>b[1]-a[1]).forEach(([r,n]) => console.log(`  ${n.toString().padStart(5)}  ${r}`));

// Save audit
writeFileSync(resolve(repoRoot, 'scripts/discovery-output/v3-audit.json'),
  JSON.stringify({ pass: pass.map(p => ({ id: p.id, name: p.name, reason: p.passReason })), fail: fail.map(f => ({ id: f.id, name: f.name, city: f.city, state: f.state, reason: f.failReason })) }, null, 2));

console.log(`\nFirst 30 FAIL samples:`);
for (const f of fail.slice(0, 30)) console.log(`  [${f.failReason}] ${f.name.slice(0,38).padEnd(38)} ${f.city||'?'}, ${f.state||'?'}`);

// REVERT
console.log(`\nReverting ${fail.length} listings to is_touchless=false...`);
const ids = fail.map(f => f.id);
let done = 0;
for (let i = 0; i < ids.length; i += 200) {
  const batch = ids.slice(i, i + 200);
  const { error } = await sb.from('listings').update({
    is_touchless: false, is_approved: false,
    classification_source: 'reverted_apr15_v3_strict',
    crawl_notes: 'Reverted by v3 strict audit: insufficient automatic-touchless evidence',
  }).in('id', batch);
  if (!error) done += batch.length;
  else console.error('err:', error.message);
}
console.log(`Reverted: ${done}`);

const { count } = await sb.from('listings').select('*',{count:'exact',head:true}).eq('is_touchless', true);
console.log(`Total touchless listings now: ${count}`);
