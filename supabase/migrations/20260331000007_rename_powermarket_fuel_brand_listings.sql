/*
  # Rename Power Market listings that use fuel brand names

  ## Problem
  Several confirmed Power Market car wash locations were named after the fuel brand
  on their canopy (Texaco, Chevron, ExtraMile) rather than the operator (Power Market).
  This was confusing because:
  1. The Power Market brand hero image showed on a listing named "Texaco"
  2. Users searching for the car wash wouldn't find it under the fuel brand name

  ## Fix
  Rename to "Power Market (FuelBrand)" format, e.g. "Power Market (Texaco)".
  "Food Mart" (generic name) is renamed to just "Power Market".
  Slugs are left unchanged to avoid breaking existing URLs.

  ## Renamed listings
  - Texaco, Vacaville CA          → Power Market (Texaco)
  - Chevron, Pomona CA            → Power Market (Chevron)
  - ExtraMile, Fullerton CA       → Power Market (ExtraMile)
  - ExtraMile, Pomona CA          → Power Market (ExtraMile)
  - ExtraMile, Oceanside CA       → Power Market (ExtraMile)
  - ExtraMile, Roseville CA       → Power Market (ExtraMile)
  - Food Mart, Anaheim CA         → Power Market
*/

UPDATE listings SET name = 'Power Market (Texaco)'
WHERE id = 'b91932e9-6d30-4a68-863e-73b94d25cd70';

UPDATE listings SET name = 'Power Market (Chevron)'
WHERE id = '4b5b7329-21ea-4ac6-bd2d-6004d0828db3';

UPDATE listings SET name = 'Power Market (ExtraMile)'
WHERE id IN (
  'ecec23b0-b09f-4dcc-90c5-572438c1e10e',
  '7f56b7f4-161c-42b1-84d9-8e3feeb9a77c',
  'b942b897-b5f4-42f0-8db9-7f3c13932084',
  '35c50db8-e7dd-45be-9feb-f6e43d4f1ca7'
);

UPDATE listings SET name = 'Power Market'
WHERE id = '7bdf39b2-b880-4d42-a433-6567f877240c';
