/*
  # Allow public read access to listing-photos storage bucket

  Ensures screenshots uploaded by verify-listing edge function
  are publicly readable so they display in the admin UI.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-photos', 'listing-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read listing-photos" ON storage.objects;
CREATE POLICY "Public read listing-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-photos');
