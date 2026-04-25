/*
  # Clear 4 manually-approved heroes that were actually the wrong-chain Buckeye photo

  Bryan OH, Dayton OH, Center City KY, and Aurora IL had hero_image_source='manual'
  pointing to fe4a2837-.../hero-cropped-1773594478645.png — the Whitefish MT
  "BUCKEYE SUPER WASH" tunnel photo. Owner confirmed these were approved by
  mistake (assumed it was a generic Super Wash photo, didn't realize it was
  a different chain entirely). Clearing so the runtime resolver picks from
  the current Super Wash blue-overhang rotation.
*/

UPDATE listings
SET hero_image = NULL,
    hero_image_source = NULL
WHERE hero_image = 'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/fe4a2837-95b3-44bb-923f-b460cdc5027b/hero-cropped-1773594478645.png'
  AND hero_image_source = 'manual';
