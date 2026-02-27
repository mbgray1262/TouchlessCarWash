/*
  # Add is_self_service flag and Self-Service filter

  ## Summary
  Adds support for tracking self-service-only car washes separately from
  automated touchless washes. Self-service (wand/bay) washes were incorrectly
  classified as touchless — this migration adds the infrastructure to tag them
  correctly going forward.

  ## Changes

  ### listings table
  - `is_self_service` (boolean, nullable) — true if the wash offers self-service
    wand bays. Can be true even when is_touchless = false (self-service only) or
    true (offers both automated touchless AND self-service bays).

  ### filters table
  - Adds a new "Self-Service Bays" filter with slug "self-service" for future
    self-service directory use.

  ### listing_filters
  - Populates the self-service filter from existing listings whose amenities
    array mentions "self-serve" (set by prior classification runs).
  - Also marks those listings' is_self_service = true for data consistency.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'is_self_service'
  ) THEN
    ALTER TABLE listings ADD COLUMN is_self_service boolean DEFAULT NULL;
  END IF;
END $$;

INSERT INTO filters (name, slug, category, icon, sort_order) VALUES
  ('Self-Service Bays', 'self-service', 'feature', 'hand', 7)
ON CONFLICT (slug) DO NOTHING;

UPDATE listings
SET is_self_service = true
WHERE
  is_self_service IS NULL
  AND amenities IS NOT NULL
  AND (
    array_to_string(amenities, ' ') ILIKE '%self-serv%'
    OR array_to_string(amenities, ' ') ILIKE '%self serv%'
    OR array_to_string(amenities, ' ') ILIKE '%wand bay%'
    OR array_to_string(amenities, ' ') ILIKE '%spray bay%'
  );

INSERT INTO listing_filters (listing_id, filter_id)
SELECT l.id, f.id
FROM listings l
CROSS JOIN filters f
WHERE f.slug = 'self-service'
  AND l.is_self_service = true
ON CONFLICT DO NOTHING;
