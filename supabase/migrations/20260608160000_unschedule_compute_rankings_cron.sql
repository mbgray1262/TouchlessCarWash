-- Retire the nightly best_of_rankings recompute. The daily cron (migration
-- 20260309140100) called the compute-rankings edge function, which full-refreshes
-- the trophy table with a stale Google-rating scorer. Trophies are now FROZEN
-- (see freeze trigger) and recomputed only deliberately via
-- scripts/populate-best-of-rankings.mts — so unschedule the cron.
--
-- Guarded: pg_cron may be disabled / the job may not exist in this environment,
-- in which case this is a harmless no-op.
DO $$
BEGIN
  PERFORM cron.unschedule('daily-compute-rankings');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'daily-compute-rankings cron not present — nothing to unschedule';
END
$$;
