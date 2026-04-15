#!/usr/bin/env node
/**
 * Mines existing crawl_snapshot records for subscription pricing and plan info.
 * Zero API cost — uses only regex/heuristics against data we already have in Supabase.
 *
 * For each target chain it:
 *   1. Pulls every listing's crawl_snapshot.data.markdown (and raw snapshot as fallback)
 *   2. Extracts $XX/mo and $XX.XX/month price points near "unlimited"/"membership"/"wash club"
 *   3. Extracts plan names ("Unlimited VIP", "VIP Wash Club", "Unlimited Wash Club", etc.)
 *   4. Detects feature flags: family plans, ceramic/graphene, free vacuums, 24/7
 *   5. Aggregates to per-chain min/max price + plan names + features
 *
 * Writes results to lib/chain-subscriptions.generated.json (committed).
 * The TS file lib/chain-subscriptions.ts imports and re-exports.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envCandidates = [
  resolve(repoRoot, '.env.local'),
  '/Users/michaelgray/Projects/TouchlessCarWash/.env.local',
];
const envPath = envCandidates.find(p => { try { readFileSync(p,'utf8'); return true; } catch { return false; } });
const env = readFileSync(envPath,'utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Target chains — matches UNLIMITED_CHAIN_SLUGS in app/unlimited-touchless-car-wash/page.tsx
const TARGET_CHAINS = [
  { slug: 'sheetz', name: 'Sheetz' },
  { slug: 'delta-sonic', name: 'Delta Sonic' },
  { slug: 'drive-and-shine', name: 'Drive & Shine' },
  { slug: 'kwik-trip', name: 'Kwik Trip' },
  { slug: 'splash-car-wash', name: 'Splash Car Wash' },
  { slug: 'prestige-car-wash', name: 'Prestige Car Wash' },
  { slug: 'flagstop-car-wash', name: 'Flagstop Car Wash' },
  { slug: 'foam-and-wash', name: 'Foam & Wash' },
  { slug: 'mr-magic-car-wash', name: 'Mr. Magic Car Wash' },
  { slug: 'autowash', name: 'Autowash' },
  { slug: 'super-wash', name: 'Super Wash' },
  { slug: 'brown-bear', name: 'Brown Bear' },
  { slug: 'holiday-stationstores', name: 'Holiday Stationstores' },
  { slug: 'salty-dog-car-wash', name: 'Salty Dog Car Wash' },
  { slug: 'power-market', name: 'Power Market' },
  { slug: 'extra-mile', name: 'Extra Mile' },
  { slug: 'pinnacle-365', name: 'Pinnacle 365' },
];

// Pull the markdown/text layer from whatever shape the crawl snapshot uses.
function snapshotText(snap) {
  if (!snap) return '';
  if (typeof snap === 'string') return snap;
  const parts = [];
  if (snap.data?.markdown) parts.push(snap.data.markdown);
  if (snap.data?.text) parts.push(snap.data.text);
  if (snap.data?.content) parts.push(String(snap.data.content));
  if (snap.markdown) parts.push(snap.markdown);
  if (snap.text) parts.push(snap.text);
  if (parts.length === 0) parts.push(JSON.stringify(snap));
  return parts.join('\n');
}

// Only count a dollar figure if it appears within ~80 chars of a subscription keyword.
const SUB_KEYWORDS = /(unlimited|membership|wash club|monthly|\/mo\b|per month|vip wash)/i;
const PRICE_RE = /\$\s*(\d{1,3})(?:\.(\d{2}))?\s*(?:\/\s*(?:mo|month)|per\s*month|\s*a\s*month)/gi;
const BARE_MO_RE = /(\d{1,3}(?:\.\d{2})?)\s*(?:\/\s*mo|per\s*month|\s*a\s*month)/gi;

function extractPrices(text) {
  const prices = new Set();
  const scan = (re) => {
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = Math.max(0, m.index - 120);
      const end = Math.min(text.length, m.index + 80);
      const window = text.slice(start, end);
      if (!SUB_KEYWORDS.test(window)) continue;
      const amount = parseFloat(m[1] + (m[2] ? '.' + m[2] : ''));
      if (amount >= 5 && amount <= 199) prices.add(Math.round(amount * 100) / 100);
    }
  };
  scan(PRICE_RE);
  scan(BARE_MO_RE);
  return Array.from(prices).sort((a, b) => a - b);
}

// Plan name phrases to look for. Only include short phrases that read like marketing names.
const PLAN_NAME_PATTERNS = [
  /Unlimited\s+VIP(?:\s+(?:Wash|Memberships?|Club))?/gi,
  /VIP\s+Wash\s+Club/gi,
  /Unlimited\s+Wash\s+Club/gi,
  /Touch\s*Free\s+(?:Pass|Club|Unlimited)/gi,
  /Wash\s+Club/gi,
  /Unlimited\s+Plan/gi,
  /Splash\s+Unlimited/gi,
  /Family\s+Plans?/gi,
  /Monthly\s+(?:Wash\s+)?(?:Pass|Club|Plan)/gi,
];

function extractPlanNames(text) {
  const found = new Set();
  for (const re of PLAN_NAME_PATTERNS) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const clean = m[0].replace(/\s+/g, ' ').trim();
      if (clean.length < 40) found.add(clean);
    }
  }
  return Array.from(found);
}

function extractFeatures(text) {
  const t = text.toLowerCase();
  return {
    hasUnlimited: /unlimited\s+(?:wash|vip|club|plan|membership)/i.test(text),
    hasFamilyPlan: /family\s+plans?/i.test(text),
    hasCeramic: /ceramic(?:\s+(?:wash|sealant|coat))?|graphene/i.test(text),
    hasFreeVacuums: /free\s+(?:self-?serve\s+)?vacuum/i.test(text),
    has24Hour: /24\s*(?:\/|\-)?\s*(?:hours?|hrs?|7)|open\s+24/i.test(text),
    cancelAnytime: /cancel\s+(?:at\s+)?any\s*time|no\s+contract/i.test(text),
  };
}

async function mineChain(chain) {
  const all = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const { data, error } = await sb.from('listings')
      .select('crawl_snapshot')
      .eq('parent_chain', chain.name)
      .eq('is_touchless', true)
      .not('crawl_snapshot', 'is', null)
      .range(offset, offset + 999);
    if (error) { console.error(chain.name, error); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }

  const allPrices = new Set();
  const allPlanNames = new Set();
  const features = {
    hasUnlimited: false, hasFamilyPlan: false, hasCeramic: false,
    hasFreeVacuums: false, has24Hour: false, cancelAnytime: false,
  };
  let snapshotsMined = 0;

  for (const row of all) {
    const text = snapshotText(row.crawl_snapshot);
    if (!text) continue;
    snapshotsMined++;
    extractPrices(text).forEach(p => allPrices.add(p));
    extractPlanNames(text).forEach(n => allPlanNames.add(n));
    const f = extractFeatures(text);
    for (const k of Object.keys(features)) features[k] = features[k] || f[k];
  }

  const prices = Array.from(allPrices).sort((a, b) => a - b);

  // Filter plan names: prefer chain-specific ones, dedupe case-variants
  const planNamesNormalized = {};
  for (const n of allPlanNames) {
    const key = n.toLowerCase();
    if (!planNamesNormalized[key] || n.length < planNamesNormalized[key].length) {
      planNamesNormalized[key] = n;
    }
  }
  const planNames = Object.values(planNamesNormalized).slice(0, 6);

  return {
    slug: chain.slug,
    name: chain.name,
    snapshotsMined,
    totalListings: all.length,
    prices,
    minPrice: prices[0] ?? null,
    maxPrice: prices[prices.length - 1] ?? null,
    planNames,
    features,
  };
}

const results = [];
for (const chain of TARGET_CHAINS) {
  process.stdout.write(`Mining ${chain.name}... `);
  const r = await mineChain(chain);
  results.push(r);
  console.log(`${r.snapshotsMined} snapshots, prices: [${r.prices.join(', ')}], plans: [${r.planNames.slice(0,3).join(' | ')}]`);
}

const outPath = resolve(repoRoot, 'lib/chain-subscriptions.generated.json');
writeFileSync(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'existing crawl_snapshot records, regex extraction (zero API cost)',
  chains: results,
}, null, 2));

console.log(`\nWrote ${outPath}`);
console.log(`Chains with price data: ${results.filter(r => r.prices.length > 0).length}/${results.length}`);
