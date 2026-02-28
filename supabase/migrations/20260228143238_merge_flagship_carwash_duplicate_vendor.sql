/*
  # Merge duplicate Flagship Car Wash vendor

  ## Problem
  There are two vendors named "Flagship Car Wash":
  - ID 1857: domain flagshipcarwash.com (29 listings) — the real chain
  - ID 2856: domain everwash.com (3 listings) — incorrectly created; EverWash is a
    membership platform, not the actual Flagship brand

  ## Changes
  1. The one listing under vendor 2856 that IS actually a Flagship Car Wash
     (Virginia Beach, VA) gets re-assigned to vendor 1857
  2. The other two listings (H&S Store 2025 and New Pal Car Wash) had everwash.com
     websites but are not Flagship locations — un-assign them from any vendor
  3. Delete the duplicate vendor 2856 (everwash.com)
*/

UPDATE listings
SET vendor_id = 1857
WHERE id = '8b492ce8-d3a8-4db1-ac1c-d9bd7a96cb86';

UPDATE listings
SET vendor_id = NULL
WHERE vendor_id = 2856
  AND id IN (
    '830db79a-9949-4852-936b-b599f3150c86',
    'c89b287b-052e-436e-898c-659990721e7e'
  );

DELETE FROM vendors WHERE id = 2856;
