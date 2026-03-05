-- Set hero_image from google_photo_url for listings that have a Google photo but no hero_image
UPDATE listings
SET hero_image = google_photo_url
WHERE hero_image IS NULL
  AND google_photo_url IS NOT NULL;
