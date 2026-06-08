-- Revert the rank CHECK back to 1-3. The Best-Of trophy table is a top-3
-- (gold/silver/bronze) table by design; the canonical populator
-- (scripts/populate-best-of-rankings.mts) writes only top-3. The temporary
-- widening to 1-10 was for the now-RETIRED compute-rankings edge function and
-- is no longer wanted. A 1-3 cap also hard-rejects any stray top-10 write from
-- the retired path.
ALTER TABLE best_of_rankings DROP CONSTRAINT IF EXISTS best_of_rankings_rank_check;
ALTER TABLE best_of_rankings ADD CONSTRAINT best_of_rankings_rank_check CHECK (rank BETWEEN 1 AND 3);
