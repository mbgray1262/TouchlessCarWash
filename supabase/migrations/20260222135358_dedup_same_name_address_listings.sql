/*
  # Deduplicate listings with identical name + address

  ## Summary
  A small number of listings share the exact same name and address but have different
  google_place_ids (Google occasionally returns two slightly different Place IDs for
  the same physical location). These are true duplicates and safe to remove.

  ## Strategy
  - Keep the oldest record (lowest created_at) per name+address group
  - Delete all newer duplicates in the same group
  - Only affects records where COUNT(*) > 1 for the same (name, address) pair

  ## Safety
  - All duplicate groups identified have consistent is_touchless values
  - No data loss risk — the kept record already has the full classification
  - Affects only 2 duplicate groups (4 records → 2 kept, 2 deleted)
*/

DELETE FROM listings
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY name, address
        ORDER BY
          CASE WHEN is_touchless IS NOT NULL THEN 0 ELSE 1 END,
          created_at ASC
      ) AS rn
    FROM listings
    WHERE name IS NOT NULL AND address IS NOT NULL
      AND name != '' AND address != ''
  ) ranked
  WHERE rn > 1
);
