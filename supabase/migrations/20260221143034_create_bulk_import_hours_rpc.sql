/*
  # Create bulk_import_hours RPC

  ## Purpose
  Mirrors the pattern used by bulk_enrich_listings. Accepts a JSON array of
  { place_id, working_hours } records and updates the `hours` column on
  matching listings in a single database round-trip per batch.

  ## Rules
  - Only updates rows where `hours` IS NULL or is an empty JSON object `{}`
  - Never overwrites existing hours data (additive-only)
  - Returns counts: matched, updated, skipped_already_has_hours, skipped_no_match

  ## Security
  - SECURITY DEFINER so it can be called by the anon key from the admin UI
*/

CREATE OR REPLACE FUNCTION bulk_import_hours(rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec jsonb;
  listing_id uuid;
  existing_hours jsonb;
  hours_val jsonb;
  matched_count int := 0;
  updated_count int := 0;
  skipped_already int := 0;
  skipped_no_match int := 0;
  place_id_val text;
BEGIN
  IF jsonb_array_length(rows) = 0 THEN
    RETURN jsonb_build_object(
      'matched', 0,
      'updated', 0,
      'skipped_already_has_hours', 0,
      'skipped_no_match', 0
    );
  END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    place_id_val := rec->>'place_id';
    IF place_id_val IS NULL OR place_id_val = '' THEN
      CONTINUE;
    END IF;

    SELECT id, hours INTO listing_id, existing_hours
    FROM listings
    WHERE google_place_id = place_id_val
    LIMIT 1;

    IF listing_id IS NULL THEN
      skipped_no_match := skipped_no_match + 1;
      listing_id := NULL;
      CONTINUE;
    END IF;

    matched_count := matched_count + 1;

    IF existing_hours IS NOT NULL AND existing_hours != '{}'::jsonb THEN
      skipped_already := skipped_already + 1;
      listing_id := NULL;
      CONTINUE;
    END IF;

    hours_val := rec->'working_hours';
    IF hours_val IS NULL OR hours_val = '{}'::jsonb OR hours_val = 'null'::jsonb THEN
      listing_id := NULL;
      CONTINUE;
    END IF;

    UPDATE listings SET hours = hours_val WHERE id = listing_id;

    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;

    listing_id := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'matched', matched_count,
    'updated', updated_count,
    'skipped_already_has_hours', skipped_already,
    'skipped_no_match', skipped_no_match
  );
END;
$$;
