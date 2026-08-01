-- Detailing is now the 4th community-verifiable wash type (after touchless, self_serve,
-- hand_wash — see 20260731120000_add_wash_type_to_verifications.sql). Widen the wash_type
-- CHECK so a detailing listing's "Is this a real detailer?" vote can be recorded.
ALTER TABLE listing_verifications
  DROP CONSTRAINT IF EXISTS listing_verifications_wash_type_check;
ALTER TABLE listing_verifications
  ADD CONSTRAINT listing_verifications_wash_type_check
  CHECK (wash_type IN ('touchless', 'self_serve', 'hand_wash', 'detailing'));
