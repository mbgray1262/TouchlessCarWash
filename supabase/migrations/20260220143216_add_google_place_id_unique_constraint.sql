/*
  # Add unique constraint on google_place_id for upsert support

  ## Problem
  The existing unique indexes on google_place_id are partial (WHERE google_place_id IS NOT NULL).
  Postgres requires an exact-match unique constraint (not just a partial index) for ON CONFLICT
  upsert operations via the Supabase client. Without this, bulk imports using onConflict: 'google_place_id'
  fail with "there is no unique or exclusion constraint matching the ON CONFLICT specification".

  ## Changes
  - Adds a proper unique constraint on google_place_id that handles NULL via a COALESCE trick,
    but since nulls should simply be skipped (the app already routes rows with no place_id through
    a separate slug-based upsert), the cleanest solution is to add a standard unique constraint
    that only applies to non-null values using a unique index registered as a constraint.

  ## Note
  We use CREATE UNIQUE INDEX ... IF NOT EXISTS rather than ALTER TABLE ADD CONSTRAINT because
  the column allows NULLs and multiple NULLs are fine (NULL != NULL in Postgres unique indexes).
  Then we promote it to a named constraint so ON CONFLICT can reference it.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'listings_google_place_id_key'
      AND conrelid = 'public.listings'::regclass
  ) THEN
    -- Create a full unique constraint (NULLs are distinct in Postgres, so multiple NULLs are fine)
    ALTER TABLE public.listings
      ADD CONSTRAINT listings_google_place_id_key UNIQUE (google_place_id);
  END IF;
END $$;
