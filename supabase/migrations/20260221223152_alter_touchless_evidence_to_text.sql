/*
  # Alter touchless_evidence column type from jsonb to text

  ## Problem
  The classify-one edge function sends touchless_evidence as a plain string
  (e.g. "Website mentions touchless wash options"). When the string is empty (""),
  Postgres rejects it as invalid JSON, causing the entire update to fail silently —
  is_touchless never gets written even though the classification succeeded.

  ## Changes
  - listings.touchless_evidence: jsonb -> text
    Existing data is preserved (Postgres casts JSON scalars/strings to text cleanly).
    The bulk-classify path will now store JSON-stringified evidence instead of jsonb,
    which is fine since this column is display-only.

  ## Note
  The default changes from '[]'::jsonb to '' (empty string) to match text semantics.
*/

ALTER TABLE listings
  ALTER COLUMN touchless_evidence TYPE text USING touchless_evidence::text;

ALTER TABLE listings
  ALTER COLUMN touchless_evidence SET DEFAULT '';
