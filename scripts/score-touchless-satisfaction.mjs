#!/usr/bin/env node
/**
 * Touchless Satisfaction Score (TSS) — the SCORE step of the Review-Mined Score method.
 *
 * Aggregates the labeled touchless review evidence in `review_snippets` into the
 * per-listing 0–100 score on `listings.touchless_satisfaction_score` (+ the
 * underlying touchless_pos / touchless_neg / touchless_mentions / tss_scored_at).
 *
 * PIPELINE CONTEXT (Review-Mined Score method):
 *   1. Mine   — scripts/scrape-gmaps-reviews.py  (free browser harvest → review_snippets, sets is_touchless_evidence)
 *   2. Label  — Haiku pass sets review_snippets.sentiment + review_snippets.touchless_about
 *   3. Score  — THIS SCRIPT
 *   4. Validate / 5. Display (UI already reads the score)
 *
 * FORMULA (Bayesian shrink toward the prior mean; gated on mention count):
 *   mentions = pos + neg            (neutral snippets do NOT count)
 *   score    = round( 100 * (pos + K*M) / (pos + neg + K) )   when mentions >= MIN_MENTIONS
 *   score    = NULL                                            when mentions <  MIN_MENTIONS
 *
 *   M (prior mean)   = 0.70
 *   K (prior weight) = 6
 *   MIN_MENTIONS     = 3   (see TSS_MIN_MENTIONS in lib/touchless-satisfaction.ts)
 *
 * These constants were recovered by fitting against the 2,813 listings scored by
 * the original 2026-06-04 pass: they reproduce the stored scores with 97% exact
 * matches (MAE 0.04). Keep them in sync with lib/touchless-satisfaction.ts.
 *
 * WHAT COUNTS as a touchless mention: a review_snippets row with
 *   is_touchless_evidence = true AND touchless_about IN ('touchless', NULL)
 * i.e. touchless-specific evidence, excluding snippets the Label step tagged as
 * 'other_service' / 'unclear' (bleed-over from soft-touch/self-serve bays at mixed
 * facilities). Sentiment 'positive' → pos, 'negative' → neg.
 *
 * USAGE:
 *   node scripts/score-touchless-satisfaction.mjs --missing-only   # score only listings without a score (default-safe)
 *   node scripts/score-touchless-satisfaction.mjs --all            # (re)score every touchless listing from current snippets
 *   node scripts/score-touchless-satisfaction.mjs --ids=ID1,ID2    # score specific listings
 *   node scripts/score-touchless-satisfaction.mjs --missing-only --dry-run   # preview, write nothing
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(resolve(repoRoot, '.env.local'), 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...r] = l.split('='); if (k) a[k.trim()] = r.join('=').trim(); return a; }, {});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ── Canonical TSS constants (keep in sync with lib/touchless-satisfaction.ts) ──
const PRIOR_MEAN = 0.70;
const PRIOR_WEIGHT = 6;
const MIN_MENTIONS = 3;

/** The exact Bayesian-shrunk score, or null when below the confidence gate. */
export function computeTss(pos, neg) {
  const mentions = pos + neg;
  if (mentions < MIN_MENTIONS) return null;
  return Math.round((100 * (pos + PRIOR_WEIGHT * PRIOR_MEAN)) / (mentions + PRIOR_WEIGHT));
}

// ── "Improving lately" trend constants (writes listings.touchless_trend) ──
// Positive-only by design: we reward genuine improvement, we never publicly
// label a wash as declining. A listing is 'improving' only when its TOUCHLESS
// review sentiment is BOTH meaningfully more positive lately AND now genuinely
// good — so the badge never celebrates a still-bad wash that merely got less bad.
const TREND_RECENT_MONTHS = 24;  // "recent" = reviews dated within the last 24 months
const TREND_MIN_EACH = 4;        // need >= this many pos/neg mentions in EACH window
const TREND_SWING = 20;          // recent positive-rate must beat older by >= this many points
const TREND_RECENT_FLOOR = 60;   // recent positive-rate must itself be >= this (now genuinely good)

/** 'improving' or null, from recent-vs-older touchless positive rates. */
export function computeTrend({ recentPos, recentNeg, olderPos, olderNeg }) {
  const recentTot = recentPos + recentNeg;
  const olderTot = olderPos + olderNeg;
  if (recentTot < TREND_MIN_EACH || olderTot < TREND_MIN_EACH) return null;
  const recentRate = (100 * recentPos) / recentTot;
  const olderRate = (100 * olderPos) / olderTot;
  if (recentRate >= TREND_RECENT_FLOOR && recentRate - olderRate >= TREND_SWING) return 'improving';
  return null;
}

// ── args ──
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MODE_ALL = args.includes('--all');
const idsArg = args.find((a) => a.startsWith('--ids='));
const IDS = idsArg ? idsArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
// --trend-only: recompute ONLY listings.touchless_trend for every already-scored
// listing, leaving touchless_satisfaction_score and its inputs untouched. Used to
// backfill the trend signal with zero risk of moving any score or trophy.
const TREND_ONLY = args.includes('--trend-only');
// default-safe: only fill in missing scores unless --all or --ids given
const MISSING_ONLY = !TREND_ONLY && (args.includes('--missing-only') || (!MODE_ALL && !IDS));

async function getTargetIds() {
  if (IDS) return IDS.filter((id) => !LOCKED_IDS.has(id));
  const ids = [];
  for (let offset = 0; ; offset += 1000) {
    let q = sb.from('listings').select('id').order('id').range(offset, offset + 999);
    // trend-only targets every listing that already has a published score;
    // scoring modes target touchless listings (optionally only un-scored ones).
    if (TREND_ONLY) q = q.not('touchless_satisfaction_score', 'is', null);
    else q = q.eq('is_touchless', true);
    if (MISSING_ONLY) q = q.is('touchless_satisfaction_score', null);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    ids.push(...data.map((r) => r.id));
    if (data.length < 1000) break;
  }
  return ids.filter((id) => !LOCKED_IDS.has(id));
}

// Noisy sources are excluded from scoring. `gmaps-crawl4ai-md` is whole-page
// Google Maps markdown scraped by scripts/scrape-gmaps-reviews.py — it captures
// UI chrome, reviewer headers, and owner responses, not clean review text, so it
// must never drive a score. The canonical clean source is the browser
// keyword-search harvest (`gmaps-search-clean`) plus structured pulls (serpapi /
// dataforseo / google_places).
const EXCLUDED_SOURCES = new Set(['gmaps-crawl4ai-md']);

// ── Score lock ──
// Listings emailed a Best-Of award badge/certificate at a specific score are
// LOCKED: their published Touchless Satisfaction Score is a real external
// commitment and must never be recomputed (mining/dedup/re-score could otherwise
// drift them). See scripts/score-locked-listings.json (generated from the award
// send list). The lock applies in EVERY mode — including an explicit --ids that
// names a locked listing — so nothing can move these scores by accident.
const LOCKED_IDS = (() => {
  try {
    const j = JSON.parse(readFileSync(resolve(repoRoot, 'scripts/score-locked-listings.json'), 'utf8'));
    return new Set((j.locked || []).map((r) => r.id));
  } catch { return new Set(); }
})();

/** Aggregate touchless-specific sentiment counts for one listing from review_snippets.
 *  Also splits the same pos/neg evidence into a recent (<= TREND_RECENT_MONTHS)
 *  and older window by iso_date, for the "improving" trend signal. */
async function aggregate(listingId) {
  let pos = 0, neg = 0;
  let recentPos = 0, recentNeg = 0, olderPos = 0, olderNeg = 0;
  const recentCutoff = Date.now() - TREND_RECENT_MONTHS * 30.44 * 24 * 60 * 60 * 1000;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from('review_snippets')
      .select('sentiment, touchless_about, source, iso_date')
      .eq('listing_id', listingId)
      .eq('is_touchless_evidence', true)
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const s of data) {
      if (EXCLUDED_SOURCES.has(s.source)) continue; // noisy markdown scrape — never score on it
      // exclude evidence the Label step attributed to a non-touchless bay
      if (s.touchless_about === 'other_service' || s.touchless_about === 'unclear') continue;
      const isPos = s.sentiment === 'positive';
      const isNeg = s.sentiment === 'negative';
      if (isPos) pos++; else if (isNeg) neg++; else continue;
      // trend windowing — only counts snippets with a parseable date
      const t = s.iso_date ? Date.parse(s.iso_date) : NaN;
      if (!Number.isNaN(t)) {
        if (t >= recentCutoff) { if (isPos) recentPos++; else recentNeg++; }
        else { if (isPos) olderPos++; else olderNeg++; }
      }
    }
    if (data.length < 1000) break;
  }
  return { pos, neg, recentPos, recentNeg, olderPos, olderNeg };
}

async function main() {
  const ids = await getTargetIds();
  const mode = IDS ? `ids(${ids.length})` : MISSING_ONLY ? 'missing-only' : 'all';
  const priorTerm = +(PRIOR_WEIGHT * PRIOR_MEAN).toFixed(2); // 4.2
  console.log(`TSS scorer — mode=${mode}, dry_run=${DRY_RUN}, formula=round(100*(pos+${priorTerm})/(pos+neg+${PRIOR_WEIGHT})), gate>=${MIN_MENTIONS}`);
  console.log(`Targets: ${ids.length}  (score-locked, always skipped: ${LOCKED_IDS.size})`);

  let scored = 0, gated = 0, changed = 0, errors = 0, improving = 0;
  const dist = { '84+': 0, '76-83': 0, '62-75': 0, '47-61': 0, '<47': 0 };

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      const agg = await aggregate(id);
      const { pos, neg } = agg;
      const mentions = pos + neg;
      const score = computeTss(pos, neg);
      const trend = computeTrend(agg);
      if (trend === 'improving') improving++;
      if (score == null) gated++; else {
        scored++;
        if (score >= 84) dist['84+']++; else if (score >= 76) dist['76-83']++;
        else if (score >= 62) dist['62-75']++; else if (score >= 47) dist['47-61']++; else dist['<47']++;
      }
      if (!DRY_RUN) {
        // --trend-only writes ONLY the trend flag (never touches the score/inputs).
        const payload = TREND_ONLY
          ? { touchless_trend: trend }
          : {
              touchless_pos: pos,
              touchless_neg: neg,
              touchless_mentions: mentions,
              touchless_satisfaction_score: score,
              touchless_trend: trend,
              tss_scored_at: new Date().toISOString(),
            };
        const { error } = await sb.from('listings').update(payload).eq('id', id);
        if (error) { errors++; console.log(`  ERR ${id.slice(0, 8)}: ${error.message}`); continue; }
        changed++;
      }
    } catch (e) { errors++; console.log(`  ERR ${id.slice(0, 8)}: ${e.message}`); }
    if ((i + 1) % 100 === 0) console.log(`  …${i + 1}/${ids.length} (scored ${scored}, gated ${gated}, improving ${improving})`);
  }

  console.log(`\n=== DONE ===`);
  console.log(`scored (>=${MIN_MENTIONS} mentions): ${scored}`);
  console.log(`gated (left NULL): ${gated}`);
  console.log(`written: ${DRY_RUN ? '0 (dry-run)' : changed}${TREND_ONLY ? ' (trend-only — scores untouched)' : ''}  errors: ${errors}`);
  console.log(`"improving lately" trend: ${improving}`);
  if (!TREND_ONLY) console.log(`score distribution: Excellent(84+)=${dist['84+']} VeryGood(76-83)=${dist['76-83']} Good(62-75)=${dist['62-75']} Fair(47-61)=${dist['47-61']} Mixed(<47)=${dist['<47']}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
