/*
  # Set Istobal as equipment brand for all Power Market listings

  ## Context
  Power Market car washes (Oregon/Washington chain) use Istobal touchless equipment
  per their website (https://pwrmarket.com/car-washes-oregon/).

  ## Changes
  - Sets equipment_brand = 'istobal' for all listings with parent_chain = 'Power Market'
    that don't already have a manually-assigned equipment brand.
  - Leaves equipment_model unchanged (null by default; can be set during individual review).
*/

UPDATE listings
SET equipment_brand = 'istobal'
WHERE parent_chain = 'Power Market'
  AND (equipment_brand IS NULL OR equipment_brand = '');
