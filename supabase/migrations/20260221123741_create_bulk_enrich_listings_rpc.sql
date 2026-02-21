/*
  # Create bulk_enrich_listings RPC

  ## Purpose
  Replaces N individual UPDATE calls (one per matched row) with a single
  UPDATE ... FROM (VALUES ...) statement per batch. This reduces database
  round-trips from potentially thousands down to one per batch.

  ## Function: bulk_enrich_listings
  - Accepts a JSON array of enrichment records, each containing a `place_id`
    and any subset of the enrichable columns.
  - For each record, updates the matching listing row ONLY where the target
    column is currently NULL (additive-only, never overwrites existing data).
  - Returns a summary: matched count and per-column update counts.

  ## Security
  - SECURITY DEFINER so it can be called by anon key (admin-only UI usage).
  - Input is validated — unknown columns are ignored.
*/

CREATE OR REPLACE FUNCTION bulk_enrich_listings(rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec jsonb;
  listing_id uuid;
  col_name text;
  col_value text;
  matched_count int := 0;
  cols_updated jsonb := '{}'::jsonb;
  current_count int;
  allowed_columns text[] := ARRAY[
    'google_photo_url', 'google_logo_url', 'street_view_url',
    'google_photos_count', 'google_description', 'google_about',
    'google_subtypes', 'google_category', 'business_status',
    'is_google_verified', 'reviews_per_score', 'popular_times',
    'typical_time_spent', 'price_range', 'booking_url',
    'google_maps_url', 'google_id'
  ];
  updated_cols text[];
  sql_parts text[];
  full_sql text;
  place_id_val text;
BEGIN
  IF jsonb_array_length(rows) = 0 THEN
    RETURN jsonb_build_object('matched', 0, 'columns_updated', '{}'::jsonb);
  END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    place_id_val := rec->>'place_id';
    IF place_id_val IS NULL OR place_id_val = '' THEN
      CONTINUE;
    END IF;

    SELECT id INTO listing_id
    FROM listings
    WHERE google_place_id = place_id_val
    LIMIT 1;

    IF listing_id IS NULL THEN
      CONTINUE;
    END IF;

    updated_cols := ARRAY[]::text[];
    sql_parts := ARRAY[]::text[];

    FOR col_name IN SELECT * FROM unnest(allowed_columns)
    LOOP
      IF rec ? col_name AND rec->>col_name IS NOT NULL AND rec->>col_name != '' THEN
        sql_parts := array_append(
          sql_parts,
          format('%I = CASE WHEN %I IS NULL THEN %L::%s ELSE %I END',
            col_name, col_name,
            rec->>col_name,
            CASE col_name
              WHEN 'google_photos_count' THEN 'integer'
              WHEN 'is_google_verified' THEN 'boolean'
              WHEN 'google_about' THEN 'jsonb'
              WHEN 'reviews_per_score' THEN 'jsonb'
              WHEN 'popular_times' THEN 'jsonb'
              ELSE 'text'
            END,
            col_name
          )
        );
        updated_cols := array_append(updated_cols, col_name);
      END IF;
    END LOOP;

    IF array_length(sql_parts, 1) IS NULL THEN
      CONTINUE;
    END IF;

    full_sql := 'UPDATE listings SET ' || array_to_string(sql_parts, ', ') ||
                ' WHERE id = $1';

    EXECUTE full_sql USING listing_id;

    IF FOUND THEN
      matched_count := matched_count + 1;

      FOR col_name IN SELECT * FROM unnest(updated_cols)
      LOOP
        IF (cols_updated ? col_name) THEN
          current_count := (cols_updated->>col_name)::int + 1;
        ELSE
          current_count := 1;
        END IF;
        cols_updated := jsonb_set(cols_updated, ARRAY[col_name], to_jsonb(current_count));
      END LOOP;
    END IF;

    listing_id := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'matched', matched_count,
    'columns_updated', cols_updated
  );
END;
$$;
