-- Dedicated marker for the Photo Audit "Best-Of Winners" hero-quality review
-- pass. Trophy-winner membership (a top-3 rank in best_of_rankings) never
-- changes when a hero is approved, so there was no natural way to track which
-- winners the admin has already eyeballed. This timestamp is set when a winner
-- is marked reviewed (or approved) from the Best-Of tab, and the tab filters on
-- it so the queue shrinks as you work. Kept separate from the generic
-- reviewed_at (which many live listings already have set from prior passes).
ALTER TABLE listings ADD COLUMN IF NOT EXISTS best_of_hero_reviewed_at timestamptz;
