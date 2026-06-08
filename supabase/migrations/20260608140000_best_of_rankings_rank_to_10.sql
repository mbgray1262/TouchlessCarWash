-- best_of_rankings.rank was constrained BETWEEN 1 AND 3, but the badge system
-- (app/api/badge/[slug]) awards positional badges for rank 1-3 AND a "Top 10"
-- badge for rank 4-10, and listing detail pages surface up to the top-ranked
-- siblings. The compute-rankings job now stores the top 10 per metro to match,
-- so widen the constraint. (A stale 1-3 cap silently failed the recompute's
-- insert, which after its delete-all step left the table empty.)
ALTER TABLE best_of_rankings DROP CONSTRAINT IF EXISTS best_of_rankings_rank_check;
ALTER TABLE best_of_rankings ADD CONSTRAINT best_of_rankings_rank_check CHECK (rank BETWEEN 1 AND 10);
