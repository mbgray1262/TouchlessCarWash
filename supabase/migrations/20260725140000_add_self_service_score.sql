-- Self-Serve Satisfaction Score — the self-serve twin of touchless_satisfaction_score.
-- 0-100, computed by scripts/score-selfserve-satisfaction.mjs from the Bayesian-shrunk positive
-- share of SELF-SERVE review sentiment (same formula/constants as TSS). INTERNAL ranking key only:
-- it orders the self-serve best-of pages and lists, but is NOT displayed as a gauge (the listing
-- page shows the positive/negative buckets instead — Michael's "buckets, no score" choice).
--
-- NULL = not enough self-serve sentiment (< 3 pos/neg mentions) to score, same gate as TSS.
alter table listings add column if not exists self_service_score smallint;

-- When the score was last computed. Paired with self_service_reviews_mined_at, this is the
-- dirty-flag the drain uses: a listing is re-scored only when it was (re-)mined since it was last
-- scored — so the cron never re-scans the whole scored set every cycle (Micro-DB safe). NULL =
-- never scored, so a newly-approved+mined listing is picked up automatically.
alter table listings add column if not exists self_service_scored_at timestamptz;

comment on column listings.self_service_score is
  'Self-Serve Satisfaction Score 0-100 (Bayesian positive share of self-serve review sentiment; NULL if <3 mentions). Internal ranking key for self-serve best-of pages/lists — never shown as a gauge, never affects visibility.';

-- Best-of-eligible self-serve washes: scored + credible on Google. Mirrors the touchless trophy gate.
create index if not exists listings_self_service_score_idx
  on listings (self_service_score desc nulls last)
  where is_self_service = true and is_approved = true;
