/*
  # Remove unverified ExtraMile listings

  The chain classification rule "ExtraMile = Chevron convenience store brand,
  touchless IBA standard" produced 15 listings, but Google Places confirms
  only 1 of 15 actually has a car wash. The other 14 are Chevron c-stores
  (gas + snacks) with no evidence of a car wash at all.

  These 14 listings are marked is_touchless=false and touchless_verified='not_touchless'
  so they no longer appear on the site.

  NOTE: The 1 verified ExtraMile listing (has_car_wash_attr=true per Google)
  is intentionally kept.

  Related: Chevron (155), Exxon (97), Mobil (69) have similar unverified listings
  but at lower rates (27-41%) so those are left for manual review via Photo Audit.
*/

UPDATE listings
SET
  is_touchless        = false,
  touchless_verified  = 'not_touchless',
  crawl_notes         = crawl_notes || ' | REMOVED: ExtraMile c-store with no Google car wash confirmation'
WHERE id IN (
  'a1e673fd-e8f6-41f8-b9ff-67b915b35d36',  -- ExtraMile, Vista CA
  'c0e60b8f-286d-4c4e-82e9-4ccb2a19c803',  -- ExtraMile, Grover Beach CA
  '81943197-ecd3-4f5c-9437-1cae3d12d061',  -- ExtraMile, Irwin ID
  'db243f0e-4434-4d57-ae55-8f5e804b1a77',  -- ExtraMile, Napa CA
  '6199965c-2505-4a17-9b6e-37fb4eefff2d',  -- ExtraMile, Aloha OR
  '8bf727c3-6825-45ea-8ca1-14a72dafa989',  -- ExtraMile, Simi Valley CA
  '75844add-066e-427d-a45b-ad9edc0c0feb',  -- ExtraMile, San Diego CA  ← the one you found
  '2674f756-ab5d-4d3a-8146-ca1cd8847236',  -- ExtraMile, Anaheim CA
  'cf702386-0dd8-4329-99d7-40f6d0b56959',  -- ExtraMile, San Jose CA
  '792372f1-53b8-4399-a068-bdba1767bfc7',  -- ExtraMile, Modesto CA
  '296ff48c-3df9-4890-b967-66ff24c0c029',  -- ExtraMile, Lancaster CA
  '60fe988c-fff9-47aa-a576-02786e2de02a',  -- ExtraMile, Sacramento CA
  '5f13780a-dfee-421a-a5ae-fc1d7ab558e3',  -- ExtraMile Car Wash, Grover Beach CA
  'ccf3ad40-79d1-498a-b989-caefe967d208'   -- ExtraMile, Irvine CA
);
