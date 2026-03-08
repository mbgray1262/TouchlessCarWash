-- Remove self-service car washes from touchless classification.
-- Self-serve spray bays are no longer considered "touchless" for the purposes
-- of this directory. Only automated touchless washes qualify.
--
-- Impact:
--   ~465 self-serve-only listings → is_touchless = false
--   ~466 hybrid listings → self_serve_spray removed from wash_types array
--   CHECK constraint updated to only allow 'touchless_automatic'
--   self-serve-bays filter removed

BEGIN;

-- 1. Reclassify self-serve-only listings (those whose only wash type is self_serve_spray)
UPDATE listings
SET
  is_touchless = false,
  is_approved = false,
  touchless_wash_types = '{}'
WHERE is_touchless = true
  AND touchless_wash_types = ARRAY['self_serve_spray']::TEXT[];

-- 2. Remove self_serve_spray from ALL remaining listings that have it
UPDATE listings
SET touchless_wash_types = array_remove(touchless_wash_types, 'self_serve_spray')
WHERE 'self_serve_spray' = ANY(touchless_wash_types);

-- 3. Update CHECK constraint to only allow touchless_automatic
ALTER TABLE listings DROP CONSTRAINT IF EXISTS valid_touchless_wash_types;
ALTER TABLE listings ADD CONSTRAINT valid_touchless_wash_types CHECK (
  touchless_wash_types <@ ARRAY['touchless_automatic']::TEXT[]
);

-- 4. Remove self-serve-bays filter associations and the filter itself
DELETE FROM listing_filters
WHERE filter_id = (SELECT id FROM filters WHERE slug = 'self-serve-bays');

DELETE FROM filters WHERE slug = 'self-serve-bays';

COMMIT;
