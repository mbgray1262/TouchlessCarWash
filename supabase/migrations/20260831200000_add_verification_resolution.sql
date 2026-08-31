-- Community Verifications queue: record when an admin has RESOLVED a listing's
-- flags for a given wash type. Before this, "needs review" was derived purely from
-- "does this listing still have any thumbs-down votes?" — so acting on a card
-- (marking it not-touchless, confirming it, removing it) never cleared the queue;
-- only hard-deleting the votes did. That made the admin's own decision feel ignored.
--
-- With resolved_at, a verdict stamps the negative votes as handled (evidence is kept,
-- not deleted) and the card leaves the outstanding queue. A NEW vote arriving later is
-- unresolved again, so a re-flagged listing correctly reopens for review. resolved_action
-- records WHICH verdict was given so the card can show "you marked this not touchless", etc.
ALTER TABLE listing_verifications
  ADD COLUMN IF NOT EXISTS resolved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_action text;

-- Fast "is this listing+type still outstanding?" lookups.
CREATE INDEX IF NOT EXISTS idx_listing_verifications_resolved
  ON listing_verifications (listing_id, wash_type, resolved_at);
