/*
  # Add state descriptions table

  ## Summary
  Adds support for AI-generated unique state descriptions that improve SEO
  and differentiate each state page from the others.

  ## New Tables
  - `state_descriptions`
    - One row per state with a unique AI-generated description
    - Readable by anon role (used by state pages at build/request time)
*/

CREATE TABLE IF NOT EXISTS state_descriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  description text,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE state_descriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read state descriptions"
  ON state_descriptions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role can manage state descriptions"
  ON state_descriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
