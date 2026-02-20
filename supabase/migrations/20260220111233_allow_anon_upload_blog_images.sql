/*
  # Allow anon role to upload blog images

  The /api/upload-image route is server-side and only used by the admin blog editor.
  Since there is no SUPABASE_SERVICE_ROLE_KEY in the environment, we allow the anon
  role to insert into the blog-images bucket so the API route can use the anon key.

  1. Changes:
     - Add INSERT policy for anon role on blog-images bucket
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Anon can insert blog images'
  ) THEN
    CREATE POLICY "Anon can insert blog images"
      ON storage.objects FOR INSERT
      TO anon
      WITH CHECK (bucket_id = 'blog-images');
  END IF;
END $$;
