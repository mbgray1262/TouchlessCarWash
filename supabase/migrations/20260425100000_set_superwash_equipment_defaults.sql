/*
  # Set Super Wash equipment defaults to Super Wash → Supermatic

  ## Context
  Super Wash is a 181-location chain whose locations all run their own
  in-house Supermatic touchless system. Yet ~98 listings had no
  equipment_brand set and ~106 had no equipment_model — leaving the
  admin photo-audit dropdowns blank for the majority of the chain.

  Same one-shot pattern as the Power Market migration
  (20260331000004_set_powermarket_equipment_istobal.sql).

  ## Changes
  - Sets equipment_brand = 'super_wash' for all Super Wash listings where
    it is null or empty.
  - Sets equipment_model = 'Supermatic' for all Super Wash listings where
    it is null or empty.

  The canonicalize_equipment trigger
  (20260424160000_canonicalize_equipment_trigger.sql) leaves these values
  unchanged — 'super_wash' is already a canonical brand slug and
  'Supermatic' is the canonical model spelling for that brand.
*/

UPDATE listings
SET equipment_brand = 'super_wash'
WHERE parent_chain = 'Super Wash'
  AND (equipment_brand IS NULL OR equipment_brand = '');

UPDATE listings
SET equipment_model = 'Supermatic'
WHERE parent_chain = 'Super Wash'
  AND (equipment_model IS NULL OR equipment_model = '');
