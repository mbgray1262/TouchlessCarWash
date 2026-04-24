-- Canonicalize equipment_brand / equipment_model on every write.
--
-- Multiple code paths write to these columns (classify-batch, classify-one,
-- detect-equipment, batch-photo-audit, extract-equipment-text, extract-rich-
-- data, admin UI) and each historically persisted whatever the AI returned
-- without enforcing a canonical case. Result: 40+ case-variant duplicates
-- like "laserwash 360 plus" vs "LaserWash 360 Plus" that cluttered the
-- admin dropdown and split per-brand listing counts across duplicate pages.
--
-- This trigger centralizes the normalization so we don't have to patch every
-- writer. The canonical lists mirror EQUIPMENT_BRANDS + EQUIPMENT_MODELS in
-- app/admin/hero-review/types.ts.

CREATE OR REPLACE FUNCTION canonicalize_equipment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  canonical_brands TEXT[] := ARRAY[
    'pdq','washworld','belanger','ryko','istobal','ds','petit','oasis',
    'mark_vii','karcher','autec','coleman_hanna','broadway','hydrospray',
    'dencar','ns_corp','maxar','washman','super_wash','nustar','delta_sonic',
    'futura','other'
  ];
  -- model_map: rows of (brand_slug, canonical_model). Case-insensitive match
  -- against the canonical column picks the canonical spelling.
  model_map JSONB := '{
    "pdq": ["LaserWash","LaserWash 360","LaserWash 360 Plus","LaserWash 4000","LaserWash G5","LaserWash M5","LaserWash Sentry","ProTouch","Tandem Surfline","Access","SoftGloss XS"],
    "washworld": ["Razor","Razor Double Barrel","Razor Edge","Razor Touch","Razor XR","Profile","Profile Max","High Velocity"],
    "belanger": ["Kondor","Kondor KL2","Eclipse","FreeStyler","SpinLite","Vector","Saber"],
    "ryko": ["SoftGloss","SoftGloss Maxx","Radius"],
    "istobal": ["M''NEX","M''NEX 22","M''NEX 25","M''NEX 32","ISTOBAL 1900","FLEX 5"],
    "ds": ["IQ 2.0 Touch Free","IQ Touch Free","IQ 2.0","IQ 2.0 Genius Series","5000","Carwash Systems"],
    "petit": ["Accutrac 360i","Accutrac 360t","Accutrac Mini"],
    "oasis": ["Typhoon","Eclipse","Kwik Wash","XR-1000","XP"],
    "mark_vii": ["ChoiceWash XT","ChoiceWash CT","AquaJet","SoftLine"],
    "karcher": ["CWB 3","CB 1/28","CB 2/28","CB 3/32","Opti 6000 Professional","Opti 8000"],
    "autec": ["Evolution","EV-1 Evolution","AES-425","Express Automatic"],
    "coleman_hanna": ["Water Wizard 2.0"],
    "broadway": ["Wonder Bar"],
    "hydrospray": ["In Bay Automatic (IBA)"],
    "dencar": ["Dynawash Express"],
    "super_wash": ["Supermatic","Supermatic II"],
    "nustar": ["Comet","Super Comet"],
    "delta_sonic": ["Custom Tunnel"],
    "futura": ["Revolution"],
    "other": ["CROSSFIRE"]
  }'::JSONB;
  brand_in TEXT;
  model_in TEXT;
  brand_canonical TEXT;
  model_canonical TEXT;
  brand_lower TEXT;
  model_trimmed TEXT;
  model_stripped TEXT;
  candidates JSONB;
  candidate TEXT;
BEGIN
  brand_in := NEW.equipment_brand;
  model_in := NEW.equipment_model;

  -- ── Brand normalization ──
  IF brand_in IS NOT NULL THEN
    brand_canonical := TRIM(brand_in);
    IF brand_canonical = '' THEN
      brand_canonical := NULL;
    ELSIF brand_canonical = ANY(canonical_brands) THEN
      -- Already canonical — leave alone.
      NULL;
    ELSE
      -- Case-insensitive match against canonical slugs.
      brand_lower := LOWER(brand_canonical);
      IF brand_lower = ANY(canonical_brands) THEN
        brand_canonical := brand_lower;
      ELSE
        -- Non-canonical custom brand: lowercase snake_case for a tidy
        -- vocabulary label ("Mr Magic" → "mr_magic" → renders as "Mr Magic").
        brand_canonical := REGEXP_REPLACE(
          REGEXP_REPLACE(LOWER(brand_canonical), '[&]', '', 'g'),
          '[\s\-]+', '_', 'g'
        );
        brand_canonical := REGEXP_REPLACE(brand_canonical, '_+', '_', 'g');
        brand_canonical := REGEXP_REPLACE(brand_canonical, '^_|_$', '', 'g');
        IF brand_canonical = '' THEN brand_canonical := NULL; END IF;
      END IF;
    END IF;
    NEW.equipment_brand := brand_canonical;
  END IF;

  -- ── Model normalization ──
  IF model_in IS NOT NULL THEN
    -- Fix "High. Velocity"-style typos.
    model_trimmed := TRIM(REGEXP_REPLACE(model_in, '\.\s+', ' ', 'g'));
    IF model_trimmed = '' THEN
      NEW.equipment_model := NULL;
    ELSE
      model_canonical := NULL;
      IF NEW.equipment_brand IS NOT NULL THEN
        candidates := model_map -> NEW.equipment_brand;
        IF candidates IS NOT NULL THEN
          -- 1) Try full-string case-insensitive match (preserves parenthetical
          --    canonicals like "In Bay Automatic (IBA)").
          FOR candidate IN SELECT jsonb_array_elements_text(candidates) LOOP
            IF LOWER(candidate) = LOWER(model_trimmed) THEN
              model_canonical := candidate;
              EXIT;
            END IF;
          END LOOP;
          -- 2) Strip trailing parenthetical hedging and retry.
          IF model_canonical IS NULL THEN
            model_stripped := TRIM(REGEXP_REPLACE(model_trimmed, '\s*\([^)]*\)\s*$', '', 'g'));
            IF model_stripped != '' AND model_stripped != model_trimmed THEN
              FOR candidate IN SELECT jsonb_array_elements_text(candidates) LOOP
                IF LOWER(candidate) = LOWER(model_stripped) THEN
                  model_canonical := candidate;
                  EXIT;
                END IF;
              END LOOP;
              IF model_canonical IS NULL THEN
                model_canonical := model_stripped;
              END IF;
            END IF;
          END IF;
        END IF;
      END IF;
      -- No canonical match: keep the typo-fixed trimmed value as-is.
      IF model_canonical IS NULL THEN
        model_canonical := model_trimmed;
      END IF;
      NEW.equipment_model := model_canonical;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonicalize_equipment ON listings;
CREATE TRIGGER trg_canonicalize_equipment
  BEFORE INSERT OR UPDATE OF equipment_brand, equipment_model ON listings
  FOR EACH ROW
  EXECUTE FUNCTION canonicalize_equipment();

COMMENT ON FUNCTION canonicalize_equipment IS
  'Normalizes equipment_brand and equipment_model to canonical case on every write. Mirrors EQUIPMENT_BRANDS + EQUIPMENT_MODELS in app/admin/hero-review/types.ts. Runs as a BEFORE trigger so any writer (admin UI, AI classifier edge fns, backfill scripts) gets the same canonical form.';
