/**
 * compute-rankings — RETIRED 2026-06-08.
 *
 * This edge function used to FULL-REFRESH best_of_rankings (delete-all + insert)
 * using a STALE, duplicated Google-star-rating scorer. That crowned gas stations
 * and non-touchless washes, and a stray run could wipe the curated trophy list.
 *
 * The canonical, proprietary-signal trophy populator is now:
 *     scripts/populate-best-of-rankings.mts  (uses lib/metro-scoring.ts)
 * run DELIBERATELY (not on a schedule), because trophies are FROZEN once
 * outreach to winners begins — see the freeze trigger on best_of_rankings.
 *
 * This handler is intentionally inert: it never touches the database. It exists
 * only so any leftover cron/HTTP caller gets a clear 410 instead of silently
 * rewriting the rankings.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

serve(() =>
  new Response(
    JSON.stringify({
      success: false,
      retired: true,
      error:
        'compute-rankings is retired. Trophies are frozen and recomputed only ' +
        'deliberately via scripts/populate-best-of-rankings.mts.',
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  ),
);
