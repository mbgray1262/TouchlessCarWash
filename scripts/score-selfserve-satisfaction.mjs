/**
 * Self-Serve Satisfaction Score scorer — the self-serve twin of score-touchless-satisfaction.mjs.
 * Computes listings.self_service_score from the Bayesian-shrunk positive share of SELF-SERVE review
 * sentiment (source='gmaps-selfserve', is_self_serve_evidence=true, sentiment in positive/negative).
 *
 * The FORMULA + gate live in lib/self-serve-scoring.ts (shared with the future best-of page + the
 * sitemap). This script just reads sentiment counts and writes the score + self_service_scored_at.
 *
 * Modes:
 *   --all           recompute every live self-serve listing (one-time backfill; weekly refresh)
 *   --dirty         only listings (re-)mined since last scored — for the mining cron (cheap)
 *   --ids a,b,c     specific listings
 *   --dry           compute + print, no writes
 *
 * GENTLE (Micro DB — see project_supabase_micro_overload_incident): bulk-reads sentiment in
 * paginated scans and writes in batches, rather than per-listing query storms.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Formula constants — MUST stay in sync with lib/self-serve-scoring.ts (Node can't import the .ts
// from this .mjs, so they're duplicated, same as the touchless scorer duplicates TSS's constants).
const PRIOR_MEAN = 0.7, PRIOR_WEIGHT = 6, MIN_SELF_SERVE_MENTIONS = 3;
function computeSelfServeScore(pos, neg) {
  const mentions = pos + neg;
  if (mentions < MIN_SELF_SERVE_MENTIONS) return null;
  return Math.round((100 * (pos + PRIOR_WEIGHT * PRIOR_MEAN)) / (mentions + PRIOR_WEIGHT));
}

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const ALL = args.includes('--all');
const DIRTY = args.includes('--dirty');
const idsArg = (() => { const i = args.indexOf('--ids'); return i >= 0 ? (args[i+1] || '') : ''; })();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1) Decide which listings to (re)score.
let targets = [];
if (idsArg) {
  const ids = idsArg.split(',').map(s => s.trim()).filter(Boolean);
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await sb.from('listings').select('id,self_service_reviews_mined_at,self_service_scored_at')
      .in('id', ids.slice(i, i+100)).eq('is_self_service', true);
    targets.push(...(data || []));
  }
} else {
  let from = 0;
  for (;;) {
    let q = sb.from('listings').select('id,self_service_reviews_mined_at,self_service_scored_at')
      .eq('is_self_service', true).eq('is_approved', true).not('self_service_reviewed_at', 'is', null);
    const { data } = await q.order('id').range(from, from + 999);
    if (!data?.length) break;
    targets.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  if (DIRTY) {
    // Only ones never scored, or re-mined since last scored (review sentiment may have changed).
    targets = targets.filter(l => !l.self_service_scored_at ||
      (l.self_service_reviews_mined_at && l.self_service_reviews_mined_at > l.self_service_scored_at));
  }
}
if (!ALL && !DIRTY && !idsArg) { console.error('specify --all, --dirty, or --ids'); process.exit(1); }
const targetIds = new Set(targets.map(t => t.id));
console.log(`scoring ${targetIds.size} self-serve listings | ${DRY ? 'DRY' : 'APPLY'}${DIRTY ? ' (dirty)' : ''}`);

// 2) Bulk-read self-serve sentiment for the targets (few paginated scans, not per-listing).
const pos = new Map(), neg = new Map();
const idList = [...targetIds];
for (let i = 0; i < idList.length; i += 100) {
  const chunk = idList.slice(i, i + 100);
  for (const sent of ['positive', 'negative']) {
    const { data } = await sb.from('review_snippets').select('listing_id')
      .eq('source', 'gmaps-selfserve').eq('is_self_serve_evidence', true).eq('sentiment', sent)
      .in('listing_id', chunk);
    const m = sent === 'positive' ? pos : neg;
    for (const r of (data || [])) m.set(r.listing_id, (m.get(r.listing_id) || 0) + 1);
  }
  await sleep(60); // gentle pacing
}

// 3) Compute + write in batches.
const now = new Date().toISOString();
let scored = 0, gated = 0, updates = [];
for (const id of idList) {
  const p = pos.get(id) || 0, n = neg.get(id) || 0;
  const score = computeSelfServeScore(p, n);
  if (score == null) gated++; else scored++;
  updates.push({ id, self_service_score: score, self_service_scored_at: now });
}
if (!DRY) {
  for (let i = 0; i < updates.length; i += 100) {
    const batch = updates.slice(i, i + 100);
    // one PATCH per row (values differ) but throttled + pooled small
    await Promise.all(batch.map(u => sb.from('listings').update({
      self_service_score: u.self_service_score, self_service_scored_at: u.self_service_scored_at,
    }).eq('id', u.id)));
    await sleep(120);
    if ((i + 100) % 500 === 0) console.log(`  …${Math.min(i+100, updates.length)}/${updates.length} written`);
  }
}
// distribution snapshot
const dist = { excellent: 0, veryGood: 0, good: 0, fair: 0, mixed: 0 };
for (const u of updates) { const s = u.self_service_score; if (s == null) continue;
  if (s >= 84) dist.excellent++; else if (s >= 76) dist.veryGood++; else if (s >= 62) dist.good++; else if (s >= 47) dist.fair++; else dist.mixed++; }
console.log(`DONE: ${scored} scored, ${gated} gated (<${MIN_SELF_SERVE_MENTIONS} mentions).`);
console.log(`  tiers → Excellent ${dist.excellent} · Very Good ${dist.veryGood} · Good ${dist.good} · Fair ${dist.fair} · Mixed ${dist.mixed}`);
