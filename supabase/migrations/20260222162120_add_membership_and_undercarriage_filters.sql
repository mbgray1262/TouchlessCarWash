/*
  # Add Membership and Undercarriage Cleaning Amenity Filters

  ## Summary
  Adds two new amenity filters and populates them from the listings.amenities array
  using case-insensitive partial matching, consistent with how existing amenity filters work.

  ## New Filters
  1. **Membership** (slug: `membership`) — matches listings where the amenities array
     contains any value that includes the word "member" (case-insensitive).
  2. **Undercarriage Cleaning** (slug: `undercarriage-cleaning`) — matches listings
     where the amenities array contains any value that includes "undercarriage" (case-insensitive).

  ## Changes
  - Inserts two new rows into the `filters` table (idempotent via ON CONFLICT DO NOTHING)
  - Populates `listing_filters` for all existing qualifying listings
  - Uses `exists (select 1 from unnest(...) as a where lower(a) like ...)` for correct
    array element matching

  ## Icons
  - Membership: `id-card` (Lucide)
  - Undercarriage Cleaning: `car`

  ## Security
  - No RLS changes required — existing policies on filters/listing_filters already cover these rows
*/

-- Seed the two new filter definitions
INSERT INTO filters (name, slug, category, icon, sort_order) VALUES
  ('Membership',            'membership',            'amenity', 'id-card', 7),
  ('Undercarriage Cleaning','undercarriage-cleaning','amenity', 'car',     8)
ON CONFLICT (slug) DO NOTHING;

-- Populate: Membership — amenities array contains any value with "member"
INSERT INTO listing_filters (listing_id, filter_id)
SELECT l.id, f.id
FROM listings l
CROSS JOIN filters f
WHERE f.slug = 'membership'
  AND l.amenities IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM unnest(l.amenities) AS a
    WHERE lower(a) LIKE '%member%'
  )
ON CONFLICT DO NOTHING;

-- Populate: Undercarriage Cleaning — amenities array contains any value with "undercarriage"
INSERT INTO listing_filters (listing_id, filter_id)
SELECT l.id, f.id
FROM listings l
CROSS JOIN filters f
WHERE f.slug = 'undercarriage-cleaning'
  AND l.amenities IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM unnest(l.amenities) AS a
    WHERE lower(a) LIKE '%undercarriage%'
  )
ON CONFLICT DO NOTHING;
