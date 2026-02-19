/*
  # Create listing-photos storage bucket

  Creates a public storage bucket for hosting re-uploaded listing photos
  so they can be displayed without Google Maps referrer restrictions.

  1. New bucket: `listing-photos` (public)
  2. Storage policies:
     - Anyone can read (public bucket for displaying photos)
     - Only service role / authenticated can insert (edge functions use service role)
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'listing-photos',
  'listing-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for listing photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'listing-photos');

CREATE POLICY "Service role can insert listing photos"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'listing-photos');

CREATE POLICY "Service role can update listing photos"
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'listing-photos');

CREATE POLICY "Service role can delete listing photos"
  ON storage.objects FOR DELETE
  TO service_role
  USING (bucket_id = 'listing-photos');
