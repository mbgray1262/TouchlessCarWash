/*
  # Create blog-images storage bucket

  Creates a public storage bucket for blog post images uploaded via the blog editor.

  1. New bucket: `blog-images` (public, 10MB limit)
  2. Storage policies:
     - Anyone can read (public bucket for displaying images in blog posts)
     - Service role can insert/update/delete (API route uses service role key)
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog-images',
  'blog-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read access for blog images'
  ) THEN
    CREATE POLICY "Public read access for blog images"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'blog-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Service role can insert blog images'
  ) THEN
    CREATE POLICY "Service role can insert blog images"
      ON storage.objects FOR INSERT
      TO service_role
      WITH CHECK (bucket_id = 'blog-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Service role can update blog images'
  ) THEN
    CREATE POLICY "Service role can update blog images"
      ON storage.objects FOR UPDATE
      TO service_role
      USING (bucket_id = 'blog-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Service role can delete blog images'
  ) THEN
    CREATE POLICY "Service role can delete blog images"
      ON storage.objects FOR DELETE
      TO service_role
      USING (bucket_id = 'blog-images');
  END IF;
END $$;
