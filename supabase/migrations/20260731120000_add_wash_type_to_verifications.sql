-- Community verification was touchless-only. Extend it to self-serve and hand-wash
-- listings by recording WHICH wash type each vote was cast against. The is_touchless
-- boolean stays the vote value (true = visitor confirms the listing matches its wash
-- type); wash_type says which question was asked, so stats and the auto-hide safeguard
-- can be scoped per type. This matters because listings get reclassified between types
-- (e.g. a touchless listing reverted to self-serve) — old "touchless" votes must not be
-- counted toward the new type.
ALTER TABLE listing_verifications
  ADD COLUMN IF NOT EXISTS wash_type text NOT NULL DEFAULT 'touchless';

-- Existing rows were all touchless votes; the DEFAULT already backfilled them to
-- 'touchless'. Guard the allowed values.
ALTER TABLE listing_verifications
  DROP CONSTRAINT IF EXISTS listing_verifications_wash_type_check;
ALTER TABLE listing_verifications
  ADD CONSTRAINT listing_verifications_wash_type_check
  CHECK (wash_type IN ('touchless', 'self_serve', 'hand_wash'));

CREATE INDEX IF NOT EXISTS idx_listing_verifications_listing_washtype
  ON listing_verifications (listing_id, wash_type);
