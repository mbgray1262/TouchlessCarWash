-- Allow anon to upsert city_descriptions so our regeneration script can
-- maintain per-city SEO templates. Same pattern as
-- 20260416160000_allow_anon_upsert_state_descriptions.sql.

DROP POLICY IF EXISTS "anon_insert_city_descriptions" ON city_descriptions;
CREATE POLICY "anon_insert_city_descriptions"
  ON city_descriptions
  FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_city_descriptions" ON city_descriptions;
CREATE POLICY "anon_update_city_descriptions"
  ON city_descriptions
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
