/*
  # Backfill equipment brands from existing touchless_evidence text

  Quick pass to populate equipment_brand and equipment_model for listings
  where the classifier already identified specific equipment in its evidence.
  The extract-rich-data pipeline will do a more thorough extraction later.
*/

-- LaserWash 360
UPDATE listings SET equipment_brand = 'laserwash', equipment_model = 'LaserWash 360'
WHERE is_touchless = true AND equipment_brand IS NULL
  AND touchless_evidence ILIKE '%LaserWash 360%';

-- LaserWash G5
UPDATE listings SET equipment_brand = 'laserwash', equipment_model = 'LaserWash G5'
WHERE is_touchless = true AND equipment_brand IS NULL
  AND touchless_evidence ILIKE '%LaserWash G5%';

-- LaserWash (generic)
UPDATE listings SET equipment_brand = 'laserwash', equipment_model = 'LaserWash'
WHERE is_touchless = true AND equipment_brand IS NULL
  AND touchless_evidence ILIKE '%LaserWash%';

-- WashWorld Razor
UPDATE listings SET equipment_brand = 'washworld', equipment_model = 'Razor'
WHERE is_touchless = true AND equipment_brand IS NULL
  AND (touchless_evidence ILIKE '%Razor Touch Free%'
    OR touchless_evidence ILIKE '%Razor EDGE%'
    OR touchless_evidence ILIKE '%RAZOR Touch%'
    OR touchless_evidence ILIKE '%Razor wash%');

-- WashWorld Profile
UPDATE listings SET equipment_brand = 'washworld', equipment_model = 'Profile'
WHERE is_touchless = true AND equipment_brand IS NULL
  AND touchless_evidence ILIKE '%WashWorld Profile%';

-- WashWorld (generic)
UPDATE listings SET equipment_brand = 'washworld'
WHERE is_touchless = true AND equipment_brand IS NULL
  AND touchless_evidence ILIKE '%WashWorld%';

-- Petit AutoWash
UPDATE listings SET equipment_brand = 'petit', equipment_model = 'Petit AutoWash'
WHERE is_touchless = true AND equipment_brand IS NULL
  AND touchless_evidence ILIKE '%Petit%';

-- PDQ (when not already matched as LaserWash)
UPDATE listings SET equipment_brand = 'pdq'
WHERE is_touchless = true AND equipment_brand IS NULL
  AND touchless_evidence ILIKE '%PDQ%';

-- Belanger Kondor
UPDATE listings SET equipment_brand = 'belanger', equipment_model = 'Kondor'
WHERE is_touchless = true AND equipment_brand IS NULL
  AND touchless_evidence ILIKE '%Kondor%';

-- Belanger (generic)
UPDATE listings SET equipment_brand = 'belanger'
WHERE is_touchless = true AND equipment_brand IS NULL
  AND touchless_evidence ILIKE '%Belanger%';

-- Istobal
UPDATE listings SET equipment_brand = 'istobal'
WHERE is_touchless = true AND equipment_brand IS NULL
  AND touchless_evidence ILIKE '%Istobal%';

-- D&S
UPDATE listings SET equipment_brand = 'ds'
WHERE is_touchless = true AND equipment_brand IS NULL
  AND touchless_evidence ILIKE '%D&S%';

-- Ryko
UPDATE listings SET equipment_brand = 'ryko'
WHERE is_touchless = true AND equipment_brand IS NULL
  AND touchless_evidence ILIKE '%Ryko%';
