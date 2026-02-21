/*
  # Rewrite bulk_import_hours RPC to use set-based operations

  ## Problem
  The previous version looped row-by-row, issuing one SELECT + one UPDATE per
  input row. With 2,000 rows per batch that meant up to 4,000 statements and
  hit the statement timeout.

  ## Solution
  Use a single UPDATE ... FROM (SELECT ...) join to process the entire batch in
  two statements: one to find matches, one to apply updates.

  ## Changes
  - DROP old function and replace with set-based implementation
  - Returns same shape: matched, updated, skipped_already_has_hours, skipped_no_match
*/

CREATE OR REPLACE FUNCTION bulk_import_hours(rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_matched int;
  total_updated int;
  total_skipped_already int;
  total_skipped_no_match int;
  input_count int;
BEGIN
  input_count := jsonb_array_length(rows);

  IF input_count = 0 THEN
    RETURN jsonb_build_object(
      'matched', 0,
      'updated', 0,
      'skipped_already_has_hours', 0,
      'skipped_no_match', 0
    );
  END IF;

  CREATE TEMP TABLE _hours_import (
    place_id text,
    working_hours jsonb
  ) ON COMMIT DROP;

  INSERT INTO _hours_import (place_id, working_hours)
  SELECT
    r->>'place_id',
    r->'working_hours'
  FROM jsonb_array_elements(rows) AS r
  WHERE r->>'place_id' IS NOT NULL AND r->>'place_id' != '';

  SELECT COUNT(DISTINCT hi.place_id)
  INTO total_matched
  FROM _hours_import hi
  INNER JOIN listings l ON l.google_place_id = hi.place_id;

  total_skipped_no_match := (SELECT COUNT(DISTINCT hi.place_id) FROM _hours_import hi) - total_matched;

  SELECT COUNT(*)
  INTO total_skipped_already
  FROM _hours_import hi
  INNER JOIN listings l ON l.google_place_id = hi.place_id
  WHERE l.hours IS NOT NULL AND l.hours != '{}'::jsonb;

  WITH updated AS (
    UPDATE listings l
    SET hours = hi.working_hours
    FROM _hours_import hi
    WHERE l.google_place_id = hi.place_id
      AND (l.hours IS NULL OR l.hours = '{}'::jsonb)
      AND hi.working_hours IS NOT NULL
      AND hi.working_hours != '{}'::jsonb
      AND hi.working_hours != 'null'::jsonb
    RETURNING l.id
  )
  SELECT COUNT(*) INTO total_updated FROM updated;

  RETURN jsonb_build_object(
    'matched', total_matched,
    'updated', total_updated,
    'skipped_already_has_hours', total_skipped_already,
    'skipped_no_match', total_skipped_no_match
  );
END;
$$;
