/*
  # Null out generic chain hero images

  ## Summary
  Clears hero_image and hero_image_source for any URL that appears as hero_image
  on more than 5 listings simultaneously. These are generic chain banners, app store
  badges, placeholder images, and other non-facility-specific graphics that slipped
  through the AI classifier.

  ## What this does
  1. Creates a log table `generic_hero_image_audit` to record every URL cleared,
     how many listings were affected, and when it was cleaned.
  2. Inserts a record for each generic URL found (threshold: 5+ listings share it).
  3. NULLs out hero_image and hero_image_source on all affected listings.
  4. Also adds the URL to blocked_photos on those listings so re-enrichment won't
     re-pick the same URL.

  ## Security
  - RLS enabled on audit table
  - Anon read access (admin-facing, no PII)
*/

-- Audit log table
CREATE TABLE IF NOT EXISTS generic_hero_image_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hero_image_url text NOT NULL,
  listings_affected int NOT NULL,
  cleared_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE generic_hero_image_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read generic hero audit"
  ON generic_hero_image_audit FOR SELECT
  TO anon, authenticated
  USING (true);

-- Log every URL that appears on 5+ listings
INSERT INTO generic_hero_image_audit (hero_image_url, listings_affected)
SELECT hero_image, COUNT(*) AS cnt
FROM listings
WHERE hero_image IS NOT NULL
GROUP BY hero_image
HAVING COUNT(*) > 5
ORDER BY cnt DESC;

-- NULL out hero and add to blocked_photos for all affected listings
UPDATE listings
SET
  hero_image        = NULL,
  hero_image_source = NULL,
  blocked_photos    = array(
    SELECT DISTINCT unnest(
      COALESCE(blocked_photos, '{}') || ARRAY[listings.hero_image]
    )
  )
WHERE hero_image IN (
  SELECT hero_image
  FROM listings
  WHERE hero_image IS NOT NULL
  GROUP BY hero_image
  HAVING COUNT(*) > 5
);
