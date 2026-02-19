/*
  # Clear fake example.com photo URLs

  Seed data inserted placeholder `example.com` photo URLs that don't resolve to real images.
  This migration removes those fake URLs from all listings, setting photos to NULL.
  Real photo URLs (from Google Maps / lh3.googleusercontent.com) are preserved.
*/

UPDATE listings
SET photos = NULL
WHERE photos IS NOT NULL
  AND photos[1] LIKE '%example.com%';
