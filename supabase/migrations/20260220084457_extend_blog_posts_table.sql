/*
  # Extend blog_posts table with full content management columns

  ## Summary
  The blog_posts table already exists with basic columns (id, title, slug, content, excerpt,
  category, published_at). This migration adds all missing columns needed for the full
  blog admin system: status, author, meta fields, tags, featured_image_url, and timestamps.

  ## Changes to blog_posts
  - Add `meta_title` (text) — custom SEO title
  - Add `meta_description` (text) — custom meta description
  - Add `featured_image_url` (text) — hero/OG image URL
  - Add `tags` (text[]) — topic tags array
  - Add `status` (text, default 'draft') — 'draft' or 'published'
  - Add `author` (text) — byline
  - Add `created_at` (timestamptz) — creation timestamp
  - Add `updated_at` (timestamptz) — last-modified timestamp
  - Add indexes on slug and status

  ## Security
  - Enable RLS (idempotent)
  - Add policies for public read of published posts and authenticated full access
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name = 'meta_title') THEN
    ALTER TABLE blog_posts ADD COLUMN meta_title text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name = 'meta_description') THEN
    ALTER TABLE blog_posts ADD COLUMN meta_description text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name = 'featured_image_url') THEN
    ALTER TABLE blog_posts ADD COLUMN featured_image_url text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name = 'tags') THEN
    ALTER TABLE blog_posts ADD COLUMN tags text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name = 'status') THEN
    ALTER TABLE blog_posts ADD COLUMN status text NOT NULL DEFAULT 'draft';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name = 'author') THEN
    ALTER TABLE blog_posts ADD COLUMN author text NOT NULL DEFAULT 'Touchless Car Wash Finder';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name = 'created_at') THEN
    ALTER TABLE blog_posts ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name = 'updated_at') THEN
    ALTER TABLE blog_posts ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS blog_posts_slug_idx ON blog_posts (slug);
CREATE INDEX IF NOT EXISTS blog_posts_status_idx ON blog_posts (status);

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blog_posts' AND policyname = 'Public can read published posts') THEN
    CREATE POLICY "Public can read published posts"
      ON blog_posts FOR SELECT
      TO anon
      USING (status = 'published');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blog_posts' AND policyname = 'Authenticated users can read all posts') THEN
    CREATE POLICY "Authenticated users can read all posts"
      ON blog_posts FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blog_posts' AND policyname = 'Authenticated users can insert posts') THEN
    CREATE POLICY "Authenticated users can insert posts"
      ON blog_posts FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blog_posts' AND policyname = 'Authenticated users can update posts') THEN
    CREATE POLICY "Authenticated users can update posts"
      ON blog_posts FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blog_posts' AND policyname = 'Authenticated users can delete posts') THEN
    CREATE POLICY "Authenticated users can delete posts"
      ON blog_posts FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;
