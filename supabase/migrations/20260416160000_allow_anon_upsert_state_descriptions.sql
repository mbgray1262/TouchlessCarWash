-- Allow anon to upsert state_descriptions so our
-- regenerate-state-descriptions.mjs script (which runs with the anon key
-- locally) can keep per-state templates fresh.
--
-- Safety: state_descriptions is a small (~50 rows) table that only stores
-- human-reviewed editorial content per state. No PII, no user content.
-- We accept the anon-write risk because the benefit (being able to
-- rev the copy without DB access) outweighs the vandalism risk.

-- INSERT policy (needed for upsert when row doesn't exist)
DROP POLICY IF EXISTS "anon_insert_state_descriptions" ON state_descriptions;
CREATE POLICY "anon_insert_state_descriptions"
  ON state_descriptions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- UPDATE policy (needed for upsert when row exists)
DROP POLICY IF EXISTS "anon_update_state_descriptions" ON state_descriptions;
CREATE POLICY "anon_update_state_descriptions"
  ON state_descriptions
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
