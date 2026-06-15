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

// ── args ──
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MODE_ALL = args.includes('--all');
const idsArg = args.find((a) => a.startsWith('--ids='));
const IDS = idsArg ? idsArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
// default-safe: only fill in missing scores unless --all or --ids given
const MISSING_ONLY = args.includes('--missing-only') || (!MODE_ALL && !IDS);

async function getTargetIds() {
  if (IDS) return IDS;
  const ids = [];
  for (let offset = 0; ; offset += 1000) {
    let q = sb.from('listings').select('id').eq('is_touchless', true).order('id').range(offset, offset + 999);
    if (MISSING_ONLY) q = q.is('touchless_satisfaction_score', null);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    ids.push(...data.map((r) => r.id));
    if (data.length < 1000) break;
  }
  return ids;
}

// Noisy sources are excluded from scoring. `gmaps-crawl4ai-md` is whole-page
// Google Maps markdown scraped by scripts/scrape-gmaps-reviews.py — it captures
// UI chrome, reviewer headers, and owner responses, not clean review text, so it
// must never drive a score. The canonical clean source is the browser
// keyword-search harvest (`gmaps-search-clean`) plus structured pulls (serpapi /
// dataforseo / google_places).
const EXCLUDED_SOURCES = new Set(['gmaps-crawl4ai-md']);

/** Aggregate touchless-specific sentiment counts for one listing from review_snippets. */
async function aggregate(listingId) {
  let pos = 0, neg = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from('review_snippets')
      .select('sentiment, touchless_about, source')
      .eq('listing_id', listingId)
      .eq('is_touchless_evidence', true)
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const s of data) {
      if (EXCLUDED_SOURCES.has(s.source)) continue; // noisy markdown scrape — never score on it
      // exclude evidence the Label step attributed to a non-touchless bay
      if (s.touchless_about === 'other_service' || s.touchless_about === 'unclear') continue;
      if (s.sentiment === 'positive') pos++;
      else if (s.sentiment === 'negative') neg++;
    }
    if (data.length < 1000) break;
  }
  return { pos, neg };
}

async function main() {
  const ids = await getTargetIds();
  const mode = IDS ? `ids(${ids.length})` : MISSING_ONLY ? 'missing-only' : 'all';
  const priorTerm = +(PRIOR_WEIGHT * PRIOR_MEAN).toFixed(2); // 4.2
  console.log(`TSS scorer — mode=${mode}, dry_run=${DRY_RUN}, formula=round(100*(pos+${priorTerm})/(pos+neg+${PRIOR_WEIGHT})), gate>=${MIN_MENTIONS}`);
  console.log(`Targets: ${ids.length}`);

  let scored = 0, gated = 0, changed = 0, errors = 0;
  const dist = { '84+': 0, '76-83': 0, '62-75': 0, '47-61': 0, '<47': 0 };

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      const { pos, neg } = await aggregate(id);
      const mentions = pos + neg;
      const score = computeTss(pos, neg);
      if (score == null) gated++; else {
        scored++;
        if (score >= 84) dist['84+']++; else if (score >= 76) dist['76-83']++;
        else if (score >= 62) dist['62-75']++; else if (score >= 47) dist['47-61']++; else dist['<47']++;
      }
      if (!DRY_RUN) {
        const { error } = await sb.from('listings').update({
          touchless_pos: pos,
          touchless_neg: neg,
          touchless_mentions: mentions,
          touchless_satisfaction_score: score,
          tss_scored_at: new Date().toISOString(),
        }).eq('id', id);
        if (error) { errors++; console.log(`  ERR ${id.slice(0, 8)}: ${error.message}`); continue; }
        changed++;
      }
    } catch (e) { errors++; console.log(`  ERR ${id.slice(0, 8)}: ${e.message}`); }
    if ((i + 1) % 100 === 0) console.log(`  …${i + 1}/${ids.length} (scored ${scored}, gated ${gated})`);
  }

  console.log(`\n=== DONE ===`);
  console.log(`scored (>=${MIN_MENTIONS} mentions): ${scored}`);
  console.log(`gated (left NULL): ${gated}`);
  console.log(`written: ${DRY_RUN ? '0 (dry-run)' : changed}  errors: ${errors}`);
  console.log(`score distribution: Excellent(84+)=${dist['84+']} VeryGood(76-83)=${dist['76-83']} Good(62-75)=${dist['62-75']} Fair(47-61)=${dist['47-61']} Mixed(<47)=${dist['<47']}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
