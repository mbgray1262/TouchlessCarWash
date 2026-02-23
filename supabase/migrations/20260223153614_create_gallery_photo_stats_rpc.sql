/*
  # Create gallery_photo_stats RPC

  Returns aggregate stats about gallery photos across all listings:
  - total_gallery_photos: sum of all photos array lengths
  - listings_with_photos: count of listings that have at least 1 photo
  - avg_photos_per_listing: average photos per listing that has photos
*/

CREATE OR REPLACE FUNCTION gallery_photo_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total_gallery_photos', COALESCE(SUM(array_length(photos, 1)), 0),
    'listings_with_photos', COUNT(*) FILTER (WHERE photos IS NOT NULL AND array_length(photos, 1) > 0),
    'avg_photos_per_listing', CASE
      WHEN COUNT(*) FILTER (WHERE photos IS NOT NULL AND array_length(photos, 1) > 0) = 0 THEN 0
      ELSE ROUND(
        SUM(array_length(photos, 1))::numeric /
        NULLIF(COUNT(*) FILTER (WHERE photos IS NOT NULL AND array_length(photos, 1) > 0), 0),
        1
      )
    END
  )
  FROM listings
  WHERE is_touchless = true;
$$;
