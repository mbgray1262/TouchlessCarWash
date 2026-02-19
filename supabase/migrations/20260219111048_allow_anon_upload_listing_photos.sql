/*
  # Allow anon uploads to listing-photos bucket

  ## Changes
  - Adds an INSERT policy for the anon role on storage.objects for the listing-photos bucket
  - This allows the admin UI (which uses the anon key) to upload images directly from the browser
  - Reads were already public; this adds write access for uploads only

  ## Notes
  - The admin pages are not behind auth, so uploads must be permitted for the anon role
  - Screenshots already work because they go through edge functions using the service role key
*/

CREATE POLICY "Anon can upload listing photos"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'listing-photos');
